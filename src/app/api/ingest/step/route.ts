import { AllModelsExhausted, extractBatch } from "@/lib/ingest/vision";
import {
  bumpProgress,
  extractedPageNumbers,
  failJob,
  getOwnedJob,
  savePages,
} from "@/lib/ingest/store";
import { currentUser } from "@/lib/supabase/server";
import type { PageImage } from "@/lib/ingest/vision";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Extract one batch of pages.
 *
 * The client renders the PDF and calls this repeatedly until every page is
 * done. Splitting the work this way is what keeps a multi-minute ingest inside
 * a sixty-second function, and it means a dropped connection costs one batch
 * rather than the whole document.
 *
 * Idempotent: pages already in the cache are skipped and the request still
 * succeeds, so a client that retries after a timeout neither duplicates work
 * nor spends quota twice.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const form = await req.formData();
  const jobId = String(form.get("jobId") ?? "");
  if (!jobId) {
    return Response.json({ error: "jobId is required" }, { status: 400 });
  }

  let job;
  try {
    job = await getOwnedJob(jobId, user.id);
  } catch {
    // Not found and not-yours are the same answer on purpose — distinguishing
    // them would confirm the existence of another user's job.
    return Response.json({ error: "job not found" }, { status: 404 });
  }

  const already = await extractedPageNumbers(jobId);
  const images: PageImage[] = [];

  for (const entry of form.getAll("pages")) {
    if (!(entry instanceof File)) continue;
    // Field name carries the page number: "pages" repeated, filename "p12.png".
    const page = Number(entry.name.replace(/\D+/g, ""));
    if (!Number.isInteger(page) || page < 1 || page > job.n_pages) continue;
    if (already.has(page)) continue;
    images.push({ page, bytes: new Uint8Array(await entry.arrayBuffer()) });
  }

  if (images.length === 0) {
    // Everything in this batch was already cached. Report progress and move on.
    return Response.json({
      extracted: [],
      failed: [],
      pagesDone: already.size,
      nPages: job.n_pages,
    });
  }

  try {
    const found = await extractBatch(images);

    if (found.size > 0) {
      await savePages(jobId, user.id, [...found.values()]);
    }

    const done = already.size + found.size;
    await bumpProgress(jobId, done, done >= job.n_pages ? "indexing" : "extracting");

    const failed = images.map((i) => i.page).filter((p) => !found.has(p));

    return Response.json({
      extracted: [...found.keys()].sort((a, b) => a - b),
      // Reported rather than retried here: the client decides whether to send
      // them again individually, which is how a single page that trips
      // RECITATION stops costing the rest of its batch.
      failed,
      pagesDone: done,
      nPages: job.n_pages,
    });
  } catch (error) {
    if (error instanceof AllModelsExhausted) {
      await failJob(jobId, error.message);
      return Response.json(
        {
          error:
            "Hết hạn mức xử lí trong ngày. Các trang đã đọc được giữ lại — " +
            "thử lại vào ngày mai và nó tiếp tục từ chỗ dừng.",
          reason: "quota_exhausted",
        },
        { status: 429 },
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    await failJob(jobId, message);
    return Response.json({ error: message }, { status: 500 });
  }
}
