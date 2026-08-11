import type { Lang } from "./types";

// Mirror of the chunking and pacing constants in ingest/config.py. Divergence
// here means the CLI and the upload path produce different chunks from the same
// document, which would make any eval number meaningless.

export const TARGET_TOKENS = 700; // brief asks for 500-800
export const MAX_TOKENS = 900;
export const OVERLAP_TOKENS = 80;

/**
 * Rough chars-per-token, used instead of calling countTokens for every chunk.
 *
 * Vietnamese fragments into more tokens per character than English, so a single
 * character budget would produce Vietnamese chunks roughly 40% too large.
 */
export const CHARS_PER_TOKEN: Record<Lang, number> = {
  en: 4.0,
  vi: 2.6,
  mixed: 3.0,
};

/** Pages per vision request. See ingest/config.py for why this is 8. */
export const VISION_BATCH_SIZE = 8;

/**
 * Hard cap on an uploaded document.
 *
 * Not a storage limit — free tier grants each model roughly twenty requests a
 * day, and batching makes that about 640 pages across every user of the
 * deployed app. Twenty-five pages keeps a single upload to four requests.
 */
export const MAX_UPLOAD_PAGES = 25;

/** Render resolution for page images produced in the browser. */
export const RENDER_SCALE = 200 / 72;

/**
 * Byte budget for one ingest request.
 *
 * A Vercel Hobby function rejects bodies over roughly 4.5MB. Page images at 200
 * dpi average 480KB but reach 2MB on dense pages, so a fixed batch of eight
 * fits on average and bursts past the limit whenever several heavy pages land
 * together. Batching by size instead sends eight light pages or three heavy
 * ones, and never a request that cannot be delivered.
 *
 * PNG rather than JPEG: slide pages are flat colour and large type, which PNG
 * compresses better — a sample page measured 261KB as PNG against 358KB as
 * JPEG at quality 85, with no artefacts around the formulas.
 */
export const UPLOAD_BYTES_PER_REQUEST = 3_000_000;

/**
 * Uploads per user per day.
 *
 * Vision quota is a shared, per-model daily budget across every user of the
 * deployment, so one enthusiastic user can exhaust the corpus capacity for
 * everyone. This is the cheapest possible fairness rule.
 */
export const MAX_UPLOADS_PER_DAY = 5;

export function estimateTokens(text: string, lang: Lang = "en"): number {
  const ratio = CHARS_PER_TOKEN[lang] ?? 3.0;
  return Math.max(1, Math.floor(text.length / ratio));
}

export function budgetChars(nTokens: number, lang: Lang = "en"): number {
  const ratio = CHARS_PER_TOKEN[lang] ?? 3.0;
  return Math.floor(nTokens * ratio);
}
