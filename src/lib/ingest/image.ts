import { UPLOAD_BYTES_PER_REQUEST } from "./config";
import { IMAGE_MAX_EDGE } from "./kinds";

/**
 * Fit an image inside a square bound, never enlarging it.
 *
 * Separated from the canvas work because this is the part with arithmetic in
 * it, and therefore the part worth asserting on. Three things it must get
 * right: never scale up (a 300px diagram blown to 2000px is blurrier, not more
 * readable, and costs bytes), never round a thin strip down to zero, and keep
 * the aspect ratio so text does not shear.
 */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** One encoding attempt, as a promise rather than a callback. */
function encode(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("không mã hoá được ảnh"))),
      type,
      quality,
    );
  });
}

/**
 * Encode losslessly if it fits, and only then trade quality for size.
 *
 * PNG is the right default and not by preference: the images people paste are
 * screenshots of text, tables and diagrams, where JPEG rings around every glyph
 * and the vision model has to read the result.
 *
 * But PNG on photographic content is enormous. Measured in this browser on
 * random noise at 2000x1500 — the worst case PNG has — it produced **10.3MB**
 * against a 3MB request budget, where JPEG at 0.85 produced 2.1MB. A photo of a
 * whiteboard would have failed at the platform with an error this app cannot
 * write, and no amount of the code above would have caught it.
 *
 * So: PNG first, and fall back only when it does not fit. Real photographs
 * compress far better than noise, so the 0.6 step is a floor that should never
 * be reached rather than a step anyone is expected to land on.
 */
async function encodeWithinBudget(canvas: HTMLCanvasElement): Promise<Blob> {
  const png = await encode(canvas, "image/png");
  if (png.size <= UPLOAD_BYTES_PER_REQUEST) return png;

  for (const quality of [0.85, 0.6]) {
    const jpeg = await encode(canvas, "image/jpeg", quality);
    if (jpeg.size <= UPLOAD_BYTES_PER_REQUEST) return jpeg;
  }

  throw new Error(
    "ảnh quá lớn để xử lí. Thử cắt bớt phần không cần, hoặc lưu lại ở kích thước nhỏ hơn.",
  );
}

/**
 * Turn a pasted or dropped image into the same shape a rendered PDF page has.
 *
 * The extraction route has never known anything about PDFs — it takes page
 * images in a form field and runs vision over them. So an image only has to
 * arrive looking like a page, and everything downstream works unchanged:
 * chunking, embedding, citations, the refusal threshold.
 *
 * Two jobs, and the first is not optional. A phone screenshot is routinely 2-4MB
 * while one ingest request may carry 3MB, so an untouched paste can exceed the
 * body limit on its own and fail with a platform error rather than a message
 * this app can write. Drawing through a canvas bounds the longest edge and
 * re-encodes — see encodeWithinBudget for why the format is not simply PNG —
 * which also normalises whatever the clipboard handed over.
 *
 * Uses the same canvas + toBlob path as pdf.ts renderPage, for the same reason:
 * the browser already has one, and a serverless function does not.
 */
export async function toPageImage(
  file: Blob,
  maxEdge: number = IMAGE_MAX_EDGE,
): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Thrown for a corrupt file and for a format this browser cannot decode —
    // HEIC being the one people actually hit. Neither is worth distinguishing
    // to the user, but both need to say what to do next.
    throw new Error(
      "không đọc được ảnh. Thử lưu lại dưới dạng PNG hoặc JPEG rồi dán lại.",
    );
  }

  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("trình duyệt không hỗ trợ canvas 2d");

    // White underneath, because a PNG with transparency flattens to black on
    // some encoders and a dark screenshot of dark text reads as an empty page.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    return await encodeWithinBudget(canvas);
  } finally {
    // Frees the decoded pixels now rather than at the next GC. A few 4MB pastes
    // in one session is real memory on a phone.
    bitmap.close();
  }
}
