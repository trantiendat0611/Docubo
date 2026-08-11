"use client";

import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { RENDER_SCALE } from "./config";

/**
 * PDF rendering, in the browser.
 *
 * The server never sees the PDF as pages — it receives images. That is
 * deliberate: rendering server-side would need a native canvas binding, which
 * is the one dependency serverless hosting handles worst, and it would put the
 * slowest part of ingest inside a sixty-second function. The browser already
 * has a real canvas and already has the file.
 */

// The worker is resolved through the bundler rather than a hardcoded path, so
// it stays in step with the installed version. A stale worker fails with a
// version-mismatch error that reads like a corrupt PDF.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export async function openPdf(file: File): Promise<PDFDocumentProxy> {
  const data = new Uint8Array(await file.arrayBuffer());
  return pdfjs.getDocument({ data }).promise;
}

/**
 * How long one page may take before we call it stuck.
 *
 * pdfjs schedules its rendering loop on requestAnimationFrame, which browsers
 * suspend in a background tab. Rendering then stalls indefinitely rather than
 * failing — measured directly: with rAF suppressed a page never completes,
 * with rAF restored the same page renders in under a second.
 *
 * Without this ceiling a backgrounded upload hangs forever with no explanation.
 */
const RENDER_TIMEOUT_MS = 45_000;

/**
 * Render one page to PNG.
 *
 * PNG rather than JPEG: page images are flat colour and large type, which PNG
 * compresses better — a sample page measured 261KB as PNG against 358KB as
 * JPEG at quality 85 — and it leaves no artefacts around formulas, which the
 * model has to read character by character.
 */
export async function renderPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  scale = RENDER_SCALE,
): Promise<Blob> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  const context = canvas.getContext("2d");
  if (!context) throw new Error("trình duyệt không hỗ trợ canvas 2d");

  const task = page.render({ canvas, canvasContext: context, viewport });

  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      task.cancel();
      reject(
        new Error(
          `trang ${pageNumber} không render xong sau ${RENDER_TIMEOUT_MS / 1000}s. ` +
            "Nếu bạn chuyển sang tab khác, trình duyệt tạm dừng việc vẽ trang — " +
            "hãy giữ tab này hiển thị rồi thử lại.",
        ),
      );
    }, RENDER_TIMEOUT_MS);
  });

  try {
    await Promise.race([task.promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }

  page.cleanup();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("không tạo được ảnh trang"))),
      "image/png",
    );
  });
}
