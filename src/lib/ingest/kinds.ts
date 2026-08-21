/**
 * What kind of upload is this, and is it one we accept?
 *
 * Shared by the browser and the upload route on purpose. The client branches on
 * it to decide whether to run pdfjs; the server validates with it. Two copies of
 * this rule would drift, and the failure would be quiet — a file the client
 * happily rendered and the server then refused, or worse, the reverse.
 */

/**
 * Image formats a browser canvas can decode reliably.
 *
 * HEIC is deliberately absent: iPhones produce it, `createImageBitmap` cannot
 * decode it outside Safari, and accepting it would mean a file that uploads and
 * then fails at render with nothing useful to say.
 */
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export type UploadKind = "pdf" | "image";

/**
 * Longest edge, in pixels, for a pasted image.
 *
 * Matched to what a PDF page already becomes: A4 at RENDER_SCALE (200 dpi) is
 * about 1654 x 2339, so 2000 puts a pasted screenshot in the same range the
 * vision prompt has been tuned against. Larger buys no accuracy and costs body
 * budget — the request ceiling is 3MB.
 */
export const IMAGE_MAX_EDGE = 2000;

/**
 * Classify by MIME first, extension second.
 *
 * A pasted screenshot arrives from the clipboard with a real `type` and often a
 * useless name like "image.png" or none at all, so MIME has to lead. A file
 * picked from disk can arrive with an empty `type` on some platforms, which is
 * why the extension is still consulted.
 */
export function fileKind(name: string, mime: string): UploadKind | null {
  const type = mime.toLowerCase();
  const lower = name.toLowerCase();

  if (type === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
  if ((IMAGE_TYPES as readonly string[]).includes(type)) return "image";
  if (/\.(png|jpe?g|webp)$/.test(lower)) return "image";

  return null;
}
