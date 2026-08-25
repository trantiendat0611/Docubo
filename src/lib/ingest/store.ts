import { createHash } from "node:crypto";
import { admin } from "../supabase/admin";
import { buildChunks, dominantLang } from "./chunk";
import { embedDocuments } from "./embed";
import type { Chunk, Page } from "./types";

import "server-only";

/**
 * Persistence for the upload path. Port of ingest/pipeline/store.py, plus the
 * job bookkeeping the browser-driven loop needs.
 *
 * Everything here uses the service-role client and therefore bypasses row-level
 * security, so every write sets owner_id explicitly. RLS is not a safety net on
 * this side; it is the safety net on the read side.
 */

export interface Job {
  id: string;
  owner_id: string;
  document_id: string | null;
  filename: string;
  storage_path: string;
  n_pages: number;
  pages_done: number;
  status: "pending" | "rendering" | "extracting" | "indexing" | "done" | "failed";
  error: string | null;
}

export async function createJob(input: {
  ownerId: string;
  filename: string;
  storagePath: string;
  nPages: number;
}): Promise<Job> {
  const { data, error } = await admin()
    .from("ingest_jobs")
    .insert({
      owner_id: input.ownerId,
      filename: input.filename,
      storage_path: input.storagePath,
      n_pages: input.nPages,
      status: "extracting",
    })
    .select()
    .single();

  if (error) throw new Error(`could not create job: ${error.message}`);
  return data as Job;
}

/** Load a job and confirm it belongs to the caller. */
export async function getOwnedJob(jobId: string, ownerId: string): Promise<Job> {
  const { data, error } = await admin()
    .from("ingest_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) throw new Error(`could not load job: ${error.message}`);
  if (!data) throw new Error("job not found");
  return data as Job;
}

export async function failJob(jobId: string, message: string): Promise<void> {
  await admin()
    .from("ingest_jobs")
    .update({ status: "failed", error: message.slice(0, 500), updated_at: new Date() })
    .eq("id", jobId);
}

/**
 * Cache extracted pages.
 *
 * Upsert rather than insert so a retried step is idempotent — a client that
 * loses its connection mid-batch and repeats it must not duplicate pages or
 * fail on a unique violation.
 */
export async function savePages(
  jobId: string,
  ownerId: string,
  pages: Page[],
): Promise<void> {
  if (pages.length === 0) return;

  const rows = pages.map((p) => ({
    job_id: jobId,
    owner_id: ownerId,
    page: p.page,
    content: p,
    extracted_by: p.extracted_by ?? null,
  }));

  const { error } = await admin()
    .from("document_pages")
    .upsert(rows, { onConflict: "job_id,page" });

  if (error) throw new Error(`could not save pages: ${error.message}`);
}

/** Page numbers already extracted, so a resumed job skips them. */
export async function extractedPageNumbers(jobId: string): Promise<Set<number>> {
  const { data, error } = await admin()
    .from("document_pages")
    .select("page")
    .eq("job_id", jobId);

  if (error) throw new Error(`could not read pages: ${error.message}`);
  return new Set((data ?? []).map((r) => r.page as number));
}

export async function loadPages(jobId: string): Promise<Page[]> {
  const { data, error } = await admin()
    .from("document_pages")
    .select("content")
    .eq("job_id", jobId)
    .order("page");

  if (error) throw new Error(`could not load pages: ${error.message}`);
  return (data ?? []).map((r) => r.content as Page);
}

/**
 * Correct ingest_jobs.n_pages after the real synthetic page count is known.
 *
 * Only DOCX/TXT jobs need this: their client can't know the true count before
 * the server has parsed the file, so /api/upload records a placeholder.
 * documents.n_pages is unaffected — finishDocument sets that correctly from
 * the actual loaded pages regardless, so this is purely so the job row itself
 * stops reading 1 forever, not something anything downstream depends on.
 */
export async function updateJobPageCount(jobId: string, nPages: number): Promise<void> {
  await admin().from("ingest_jobs").update({ n_pages: nPages }).eq("id", jobId);
}

export async function bumpProgress(
  jobId: string,
  pagesDone: number,
  status?: Job["status"],
): Promise<void> {
  await admin()
    .from("ingest_jobs")
    .update({
      pages_done: pagesDone,
      ...(status ? { status } : {}),
      updated_at: new Date(),
    })
    .eq("id", jobId);
}

/**
 * Turn a job's cached pages into a searchable document.
 *
 * Separate from extraction on purpose: this spends no vision quota, so the
 * chunker can be retuned and the corpus rebuilt as often as needed. That is the
 * same property data/cache gives the CLI.
 */
export async function finishDocument(job: Job): Promise<{
  documentId: string;
  chunks: number;
}> {
  const pages = await loadPages(job.id);
  if (pages.length === 0) throw new Error("no extracted pages for this job");

  const chunks = buildChunks(pages);
  if (chunks.length === 0) {
    throw new Error("nothing indexable — every page was boilerplate or empty");
  }

  const vectors = await embedDocuments(chunks.map((c) => c.embed_text));

  // Hash the extracted content rather than the PDF bytes: the file is not on
  // this machine, and two uploads of the same document should be one document.
  const contentHash = createHash("sha256")
    .update(pages.map((p) => p.markdown).join("\n"))
    .digest("hex");

  const client = admin();
  const lang = dominantLang(pages);

  const { data: existing } = await client
    .from("documents")
    .select("id")
    .eq("content_hash", contentHash)
    .eq("owner_id", job.owner_id)
    .maybeSingle();

  let documentId: string;
  if (existing) {
    documentId = existing.id as string;
    await client
      .from("documents")
      .update({ title: job.filename, lang, n_pages: pages.length })
      .eq("id", documentId);
  } else {
    const { data, error } = await client
      .from("documents")
      .insert({
        filename: job.filename,
        title: job.filename.replace(/\.(pdf|docx|txt)$/i, ""),
        owner_id: job.owner_id,
        lang,
        n_pages: pages.length,
        content_hash: contentHash,
      })
      .select("id")
      .single();
    if (error) throw new Error(`could not create document: ${error.message}`);
    documentId = data.id as string;
  }

  // Replace rather than upsert: a chunking change shifts every boundary, so
  // chunk_index N is not the same content it was. Stale rows would quietly
  // poison retrieval.
  await client.from("chunks").delete().eq("document_id", documentId);
  await insertChunks(documentId, job.owner_id, chunks, vectors);

  await client
    .from("ingest_jobs")
    .update({ document_id: documentId, status: "done", updated_at: new Date() })
    .eq("id", job.id);

  return { documentId, chunks: chunks.length };
}

async function insertChunks(
  documentId: string,
  ownerId: string,
  chunks: Chunk[],
  vectors: number[][],
): Promise<void> {
  const rows = chunks.map((c, i) => ({
    document_id: documentId,
    owner_id: ownerId,
    chunk_index: c.chunk_index,
    page_start: c.page_start,
    page_end: c.page_end,
    lang: c.lang,
    display_text: c.display_text,
    embed_text: c.embed_text,
    embedding: vectors[i],
    has_formula: c.has_formula,
    has_figure: c.has_figure,
    figure_refs: c.figure_refs,
    n_tokens: c.n_tokens,
  }));

  const client = admin();
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await client.from("chunks").insert(rows.slice(i, i + 100));
    if (error) throw new Error(`could not insert chunks: ${error.message}`);
  }
}
