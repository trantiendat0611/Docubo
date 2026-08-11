import { MAX_UPLOAD_PAGES, MAX_UPLOADS_PER_DAY } from "@/lib/ingest/config";
import { createJob } from "@/lib/ingest/store";
import { admin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Start an ingest job.
 *
 * Takes the original PDF and its page count, stores the file, and returns a job
 * id the client then drives page by page. No extraction happens here — a
 * 25-page document takes minutes and this function has sixty seconds.
 *
 * The page count comes from the client, which rendered the document to know it.
 * That is fine because the count is not trusted: it is capped here, and the
 * step route only ever accepts pages within the range recorded on the job. A
 * client claiming a thousand pages gets rejected; one under-reporting only
 * short-changes itself.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const nPages = Number(form.get("nPages"));

  if (!(file instanceof File)) {
    return Response.json({ error: "file is required" }, { status: 400 });
  }
  if (!Number.isInteger(nPages) || nPages < 1) {
    return Response.json({ error: "nPages must be a positive integer" }, { status: 400 });
  }
  if (nPages > MAX_UPLOAD_PAGES) {
    return Response.json(
      {
        error: `Tài liệu có ${nPages} trang, vượt giới hạn ${MAX_UPLOAD_PAGES} trang.`,
        reason: "too_many_pages",
      },
      { status: 413 },
    );
  }
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return Response.json({ error: "chỉ hỗ trợ file PDF" }, { status: 415 });
  }

  const client = admin();

  // Vision quota is one shared daily budget for the whole deployment, so the
  // limit has to be per user rather than per request.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await client
    .from("ingest_jobs")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id)
    .gte("created_at", since);

  if ((count ?? 0) >= MAX_UPLOADS_PER_DAY) {
    return Response.json(
      {
        error: `Bạn đã tải lên ${count} tài liệu trong 24 giờ qua. Giới hạn là ${MAX_UPLOADS_PER_DAY}.`,
        reason: "daily_limit",
      },
      { status: 429 },
    );
  }

  // Keyed by user id first, which is what the storage policies check.
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
  const stamp = Date.now();
  const storagePath = `${user.id}/${stamp}-${safeName}`;

  const { error: uploadError } = await client.storage
    .from("documents")
    .upload(storagePath, file, { contentType: "application/pdf", upsert: false });

  if (uploadError) {
    return Response.json(
      { error: `không lưu được file: ${uploadError.message}` },
      { status: 500 },
    );
  }

  const job = await createJob({
    ownerId: user.id,
    filename: file.name,
    storagePath,
    nPages,
  });

  return Response.json({ jobId: job.id, nPages: job.n_pages });
}
