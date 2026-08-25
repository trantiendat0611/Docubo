import mammoth from "mammoth";
import { MAX_UPLOAD_PAGES } from "@/lib/ingest/config";
import { cleanText, detectLang, paginate } from "@/lib/ingest/paginate";
import {
  bumpProgress,
  failJob,
  getOwnedJob,
  savePages,
  updateJobPageCount,
} from "@/lib/ingest/store";
import { admin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Extract a whole DOCX or TXT job in one call.
 *
 * PDF/image ingest spreads work across repeated calls to /api/ingest/step
 * because vision is slow and Vercel's function ceiling is sixty seconds. Text
 * extraction has no vision call in it at all — parsing, cleaning, and
 * synthetic pagination for a document at this size limit are fast enough to
 * finish in one request, so there is no batching loop here to mirror.
 *
 * This route only gets the pages into document_pages. Chunking, embedding,
 * and the document row itself stay in finishDocument, called the same way the
 * PDF/image path already calls it via /api/ingest/finish — duplicating that
 * logic here would risk it drifting from what PDF ingest actually does.
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

  const { data: file, error: downloadError } = await admin()
    .storage.from("documents")
    .download(job.storage_path);

  if (downloadError || !file) {
    const message = `could not read uploaded file: ${downloadError?.message ?? "empty"}`;
    await failJob(jobId, message);
    return Response.json({ error: message }, { status: 500 });
  }

  const isDocx = /\.docx$/i.test(job.filename);
  let raw: string;
  try {
    if (isDocx) {
      const buffer = Buffer.from(await file.arrayBuffer());
      raw = (await mammoth.extractRawText({ buffer })).value;
    } else {
      // fatal: true is the point — Buffer#toString("utf-8") does not throw on
      // invalid bytes, it silently replaces them with U+FFFD, which is
      // exactly the "corrupt the text without saying so" failure this guards
      // against.
      const bytes = new Uint8Array(await file.arrayBuffer());
      raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    }
  } catch {
    const message = isDocx
      ? "Không đọc được nội dung file .docx — kiểm tra xem file có bị hỏng không."
      : "File không phải văn bản UTF-8 hợp lệ.";
    await failJob(jobId, message);
    return Response.json({ error: message }, { status: 400 });
  }

  const cleaned = cleanText(raw);
  if (!cleaned) {
    const message =
      "Không trích được nội dung từ tài liệu này — có thể nó chỉ chứa bảng " +
      "hoặc ảnh, không có văn bản để đọc.";
    await failJob(jobId, message);
    return Response.json({ error: message }, { status: 400 });
  }

  const lang = detectLang(cleaned);
  const pages = paginate(cleaned, lang);

  if (pages.length > MAX_UPLOAD_PAGES) {
    const message =
      `Tài liệu tương đương ${pages.length} trang, vượt giới hạn ${MAX_UPLOAD_PAGES} trang.`;
    await failJob(jobId, message);
    return Response.json({ error: message, reason: "too_many_pages" }, { status: 413 });
  }

  await updateJobPageCount(jobId, pages.length);
  await savePages(jobId, user.id, pages);
  await bumpProgress(jobId, pages.length, "indexing");

  return Response.json({ pagesDone: pages.length, nPages: pages.length });
}
