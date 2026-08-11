import { embed } from "ai";
import { EMBED_DIM, EMBED_MODEL, gemini } from "./gemini";
import { userClient } from "./supabase/server";
import type { DocumentSummary, QueryAnalysis, RetrievedChunk } from "./types";

export { resolveMentionedDocument } from "./scope";

/**
 * Hybrid retrieval against the hybrid_search RPC.
 *
 * Runs under the signed-in user's session, not the service-role key. The RPC is
 * SECURITY INVOKER, so the row-level policies filter chunks to the caller's own
 * documents inside the database. Isolation therefore does not depend on this
 * file remembering to pass an owner filter — omitting one returns nothing
 * rather than returning another user's corpus.
 */

export const MATCH_LIMIT = 8;

/**
 * Chunks sampled across a document for an overview.
 *
 * Higher than MATCH_LIMIT because a summary needs breadth rather than
 * precision, and low enough that twelve chunks of display text still fit a
 * prompt comfortably.
 */
export const OVERVIEW_CHUNKS = 12;
export const CANDIDATE_LIMIT = 30;
export const RRF_K = 60;

/**
 * Retrieval-score floor. Below this, the corpus does not contain an answer and
 * the app must refuse rather than let the model improvise.
 *
 * Mirrored in ingest/config.py — change both together.
 *
 * Measured on a 34-chunk bilingual corpus with gemini-embedding-001, ten
 * questions in both languages: in-scope 0.713–0.759, completely unrelated
 * ("what is the capital of France", "how to cook pho") 0.503–0.577. The 0.136
 * gap puts 0.60 in the middle.
 *
 * Note the floor rather than the gap: this model puts unrelated text around
 * 0.5, so there is no scale on which 0.35 means "no match". The original 0.35
 * guess passed every off-topic question straight through to the model, which
 * disabled the refusal path entirely while looking like it worked.
 *
 * Re-measure on the full corpus with the should_refuse group in
 * eval/eval_dataset.json. Do not carry this number to another embedding model.
 */
export const MIN_COSINE = 0.6;

export async function embedQuery(text: string): Promise<number[]> {
  const { embedding } = await embed({
    // Must match EMBED_MODEL and EMBED_DIM used at ingest, and must use the
    // query task type — chunks were embedded with the document task type.
    model: gemini.textEmbeddingModel(EMBED_MODEL, {
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: EMBED_DIM,
    }),
    value: text,
  });
  return embedding;
}

/**
 * Chunks spread across one document, in reading order.
 *
 * The path for "summarise this" — a request similarity search cannot serve,
 * because no passage means "all of it" and the query ends up matching whatever
 * is loosely on-topic anywhere in the corpus.
 */
export async function retrieveOverview(
  documentId: string,
): Promise<RetrievedChunk[]> {
  const supabase = await userClient();
  const { data, error } = await supabase.rpc("document_overview", {
    doc: documentId,
    max_chunks: OVERVIEW_CHUNKS,
  });

  if (error) throw new Error(`document_overview failed: ${error.message}`);
  return (data ?? []) as RetrievedChunk[];
}

/** The user's documents, for scoping and for resolving a name in a question. */
export async function listDocuments(): Promise<DocumentSummary[]> {
  const supabase = await userClient();
  const { data } = await supabase
    .from("documents")
    .select("id, filename, title, lang, n_pages")
    .order("created_at", { ascending: false });

  return (data ?? []) as DocumentSummary[];
}

export async function retrieve(
  analysis: QueryAnalysis,
  original: string,
  documentIds?: string[],
): Promise<RetrievedChunk[]> {
  // Embed the question as written. The embedding model is multilingual, so the
  // dense arm already crosses languages; re-embedding a translation would spend
  // quota for a marginal gain. Measure before adding it.
  const queryEmbedding = await embedQuery(original);

  const lexEn = [analysis.query_en, ...analysis.keywords].join(" ").trim();
  const lexVi = analysis.query_vi.trim();

  const supabase = await userClient();
  const { data, error } = await supabase.rpc("hybrid_search", {
    query_embedding: queryEmbedding,
    query_en: lexEn,
    query_vi: lexVi,
    match_limit: MATCH_LIMIT,
    candidate_limit: CANDIDATE_LIMIT,
    rrf_k: RRF_K,
    // Null means the whole corpus. Scoping matters once a user has several
    // documents: a question about one paper otherwise competes with every
    // other document that shares its topic.
    filter_documents: documentIds?.length ? documentIds : null,
  });

  if (error) throw new Error(`hybrid_search failed: ${error.message}`);
  return (data ?? []) as RetrievedChunk[];
}

/** True when nothing retrieved is close enough to answer from. */
export function isUngrounded(chunks: RetrievedChunk[]): boolean {
  return chunks.length === 0 || (chunks[0]?.cosine_sim ?? 0) < MIN_COSINE;
}
