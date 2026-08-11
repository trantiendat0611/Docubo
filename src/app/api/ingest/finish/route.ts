import { failJob, finishDocument, getOwnedJob } from "@/lib/ingest/store";
import { currentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Turn a job's cached pages into a searchable document.
 *
 * Chunking and embedding only — no vision quota is spent here, which is why it
 * is a separate call. The chunker can be retuned and this re-run over the same
 * cache as often as needed.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { jobId } = (await req.json()) as { jobId?: string };
  if (!jobId) {
    return Response.json({ error: "jobId is required" }, { status: 400 });
  }

  let job;
  try {
    job = await getOwnedJob(jobId, user.id);
  } catch {
    return Response.json({ error: "job not found" }, { status: 404 });
  }

  try {
    const { documentId, chunks } = await finishDocument(job);
    return Response.json({ documentId, chunks });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failJob(jobId, message);
    return Response.json({ error: message }, { status: 500 });
  }
}
