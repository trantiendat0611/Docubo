import { CHARS_PER_SYNTHETIC_PAGE } from "./config";
import type { Lang, Page } from "./types";

/**
 * Collapse noise out of text pulled from a DOCX or TXT file, per Task 2.1's
 * own wording: "loại bỏ nhiễu, normalize khoảng trắng."
 *
 * Control characters are stripped but newlines are kept — paginate() below
 * depends on blank lines to find paragraph boundaries.
 */
export function cleanText(raw: string): string {
  return raw
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Same regex guardrail.ts already uses for its own fallback language guess —
 * reused rather than re-derived, so the two never quietly disagree on what
 * counts as Vietnamese.
 */
const VI_DIACRITICS =
  /[àáâãèéêìíòóôõùúýăđĩũơưạảấầẩậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;

/** One pass over the whole document, not per synthetic page — a fragment a
 *  few hundred characters long is too short for diacritic presence/absence to
 *  mean anything. */
export function detectLang(text: string): Lang {
  return VI_DIACRITICS.test(text) ? "vi" : "en";
}

/**
 * Turn cleaned text into synthetic pages so buildChunks() — unmodified — can
 * assign varying page_start/page_end the same way it already does for real
 * PDF pages, which it derives from Math.min/max over each chunk's source
 * Page.page numbers.
 *
 * Splits only on paragraph boundaries, never mid-sentence: a page here is a
 * citation unit, not a rendering unit, so coherence matters more than hitting
 * the budget exactly. A single paragraph longer than the whole budget becomes
 * its own oversized page rather than being force-cut — chunk.ts's own
 * splitOversized() already handles the real token budget downstream.
 */
export function paginate(
  text: string,
  lang: Lang,
  charsPerPage: number = CHARS_PER_SYNTHETIC_PAGE,
): Page[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return [];

  const pages: Page[] = [];
  let buf: string[] = [];
  let bufChars = 0;

  const flush = () => {
    if (buf.length === 0) return;
    pages.push({
      page: pages.length + 1,
      lang,
      is_boilerplate: false,
      markdown: buf.join("\n\n"),
      formulas: [],
      figures: [],
    });
    buf = [];
    bufChars = 0;
  };

  for (const p of paragraphs) {
    if (buf.length > 0 && bufChars + p.length > charsPerPage) flush();
    buf.push(p);
    bufChars += p.length;
    if (bufChars >= charsPerPage) flush();
  }
  flush();

  return pages;
}
