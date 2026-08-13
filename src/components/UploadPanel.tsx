"use client";

import { useRef, useState } from "react";
import { shouldFlushBefore } from "@/lib/ingest/batching";
import { MAX_UPLOAD_PAGES } from "@/lib/ingest/config";
import { openPdf, renderPage } from "@/lib/ingest/pdf";
import { browserClient } from "@/lib/supabase/client";

/**
 * Upload a PDF and drive its ingest to completion.
 *
 * The loop lives here rather than on the server because a 25-page document
 * takes minutes and a Vercel function has sixty seconds. The browser renders
 * each page, pushes batches to /api/ingest/step, and finishes with one call to
 * /api/ingest/finish. Progress is real — it reports pages the server has
 * actually cached, not an animation.
 */

interface Props {
  /** Attach the finished document here. Null uploads into the library only. */
  conversationId: string | null;
  onDone: () => void;
}

type Phase = "idle" | "reading" | "uploading" | "extracting" | "indexing" | "error";

export function UploadPanel({ conversationId, onDone }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const busy = phase !== "idle" && phase !== "error";

  /**
   * Wrapper so nothing fails silently.
   *
   * `ingest` is fired from an event handler, so an unhandled rejection goes
   * nowhere: the progress bar simply stops and the user waits forever with no
   * message. Every failure has to end up on screen.
   */
  async function start(file: File) {
    try {
      await ingest(file);
    } catch (error) {
      setPhase("error");
      setMessage(
        error instanceof Error
          ? `Xử lí thất bại: ${error.message}`
          : "Xử lí thất bại vì lỗi không xác định.",
      );
    }
  }

  async function ingest(file: File) {
    setMessage(null);
    setDone(0);
    setPhase("reading");

    let doc;
    try {
      doc = await openPdf(file);
    } catch {
      setPhase("error");
      setMessage("Không đọc được file. Kiểm tra xem đây có phải PDF hợp lệ không.");
      return;
    }

    const nPages = doc.numPages;
    setTotal(nPages);

    // Checked here as well as on the server so an oversized document costs no
    // upload at all — the server check is the one that counts.
    if (nPages > MAX_UPLOAD_PAGES) {
      setPhase("error");
      setMessage(
        `Tài liệu có ${nPages} trang, vượt giới hạn ${MAX_UPLOAD_PAGES} trang. ` +
          "Giới hạn này đến từ hạn mức xử lí miễn phí mỗi ngày.",
      );
      return;
    }

    setPhase("uploading");

    const form = new FormData();
    form.set("file", file);
    form.set("nPages", String(nPages));

    const created = await fetch("/api/upload", { method: "POST", body: form });
    if (!created.ok) {
      setPhase("error");
      setMessage((await created.json()).error ?? "Không tạo được tiến trình xử lí.");
      return;
    }
    const { jobId } = (await created.json()) as { jobId: string };

    setPhase("extracting");

    let batch: Array<{ page: number; blob: Blob }> = [];
    let batchBytes = 0;

    const flush = async () => {
      if (batch.length === 0) return true;

      const step = new FormData();
      step.set("jobId", jobId);
      for (const { page, blob } of batch) {
        step.append("pages", new File([blob], `p${page}.png`, { type: "image/png" }));
      }

      const res = await fetch("/api/ingest/step", { method: "POST", body: step });
      batch = [];
      batchBytes = 0;

      if (!res.ok) {
        setPhase("error");
        setMessage((await res.json()).error ?? "Xử lí trang thất bại.");
        return false;
      }

      const result = (await res.json()) as { pagesDone: number };
      setDone(result.pagesDone);
      return true;
    };

    for (let page = 1; page <= nPages; page += 1) {
      const blob = await renderPage(doc, page);

      if (
        shouldFlushBefore({ count: batch.length, bytes: batchBytes }, blob.size) &&
        !(await flush())
      ) {
        return;
      }

      batch.push({ page, blob });
      batchBytes += blob.size;
    }

    if (!(await flush())) return;

    setPhase("indexing");

    const finished = await fetch("/api/ingest/finish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    });

    if (!finished.ok) {
      setPhase("error");
      setMessage((await finished.json()).error ?? "Không lập chỉ mục được tài liệu.");
      return;
    }

    const { chunks, documentId } = (await finished.json()) as {
      chunks: number;
      documentId: string;
    };

    // Attach to the open conversation so the question that follows is answered
    // from it. upsert rather than insert: re-uploading a document already in
    // this conversation is a no-op, not a primary-key violation.
    if (conversationId && documentId) {
      const { data: me } = await browserClient().auth.getUser();
      if (me.user) {
        await browserClient()
          .from("conversation_documents")
          .upsert(
            {
              conversation_id: conversationId,
              document_id: documentId,
              owner_id: me.user.id,
            },
            { onConflict: "conversation_id,document_id" },
          );
      }
    }

    setPhase("idle");
    setMessage(`Đã nạp xong ${nPages} trang thành ${chunks} đoạn. Hỏi được rồi.`);
    if (input.current) input.current.value = "";
    onDone();
  }

  const label: Record<Phase, string> = {
    idle: "",
    reading: "Đang đọc file…",
    uploading: "Đang tải lên…",
    extracting: `Đang đọc nội dung ${done}/${total} trang…`,
    indexing: "Đang lập chỉ mục…",
    error: "",
  };

  return (
    <div className="upload">
      <label
        className={`upload-drop${dragging ? " is-dragging" : ""}`}
        onDragOver={(e) => {
          // preventDefault unconditionally, before the busy check. An element
          // is only a drop target while its dragover is cancelled; skip it and
          // the browser runs its own default for a dropped file, which is to
          // navigate the tab to it. Mid-ingest that tears down the page, aborts
          // the in-flight step request, and strands the job server-side. The
          // busy case still refuses the file — but in onDrop, where refusing
          // costs nothing.
          e.preventDefault();
          if (busy) return;
          setDragging(true);
        }}
        onDragLeave={(e) => {
          // Moving onto a child fires dragleave on the label before the child's
          // dragover bubbles back up, so an unguarded handler flickers the
          // highlight every time the cursor crosses the text inside.
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (busy) return;
          const file = e.dataTransfer.files?.[0];
          if (file) void start(file);
        }}
      >
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void start(file);
          }}
        />
        <span className="headline">
          {busy ? label[phase] : "Kéo PDF vào đây, hoặc bấm để chọn"}
        </span>
        <small>Tối đa {MAX_UPLOAD_PAGES} trang · tiếng Việt hoặc tiếng Anh</small>
      </label>

      {phase === "extracting" && total > 0 && (
        <div
          className="progress"
          role="progressbar"
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={total}
        >
          <div style={{ width: `${Math.round((done / total) * 100)}%` }} />
        </div>
      )}

      {phase === "extracting" && (
        // Pages are rendered by this tab. Browsers suspend the animation frame
        // loop in a background tab, which stalls pdfjs rather than failing it,
        // so the honest thing is to say so before the progress bar appears to
        // freeze for no reason.
        <p className="note">Giữ tab này hiển thị — chuyển tab sẽ tạm dừng việc đọc trang.</p>
      )}

      {message && (
        <p className={phase === "error" ? "note note-error" : "note note-success"}>
          {message}
        </p>
      )}
    </div>
  );
}
