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

export function estimateTokens(text: string, lang: Lang = "en"): number {
  const ratio = CHARS_PER_TOKEN[lang] ?? 3.0;
  return Math.max(1, Math.floor(text.length / ratio));
}

export function budgetChars(nTokens: number, lang: Lang = "en"): number {
  const ratio = CHARS_PER_TOKEN[lang] ?? 3.0;
  return Math.floor(nTokens * ratio);
}
