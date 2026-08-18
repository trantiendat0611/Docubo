import {
  MAX_TOKENS,
  OVERLAP_TOKENS,
  TARGET_TOKENS,
  budgetChars,
  estimateTokens,
} from "./config";
import type { Chunk, Figure, Lang, Page } from "./types";

/**
 * Port of ingest/pipeline/chunk.py. Keep the two in step.
 *
 * Each chunk carries two representations:
 *
 *   display_text  markdown, LaTeX intact, figure placeholders intact. Goes to
 *                 the LLM as context and to KaTeX in the browser.
 *   embed_text    the same content as flowing prose. Display equations become
 *                 their spoken reading, figures become their description,
 *                 inline math loses its control sequences.
 *
 * Why: `\frac{\partial L}{\partial \theta}` embeds to a near-meaningless
 * vector, and no question in either language will ever retrieve it. The spoken
 * reading of the same equation embeds like the sentence it is.
 *
 * Measured later and only half right: the vector barely moves, under 0.03
 * cosine either way. What the control sequences actually ruin is the full-text
 * index, where they stem to tokens like 'langl' and 'rangl' that appear in no
 * question anyone asks. Right decision, wrong reason. SKILL_MY_PROJECT.md 1.2.
 */

const DISPLAY_MATH = /\$\$([\s\S]+?)\$\$/g;
const DISPLAY_MATH_ONLY = /^\$\$[\s\S]+?\$\$$/;
const INLINE_MATH = /(?<!\$)\$([^$\n]+?)\$(?!\$)/g;
const FIGURE_REF = /\[\[FIGURE:([^\]]+)\]\]/g;
const FIGURE_REF_ONLY = /^\[\[FIGURE:[^\]]+\]\]$/;
const HEADING = /^#{1,6}\s+/;

/** LaTeX control sequences, and the punctuation that only exists to drive them. */
const LATEX_COMMAND = /\\[a-zA-Z]+\s*|\\./g;
const LATEX_PUNCT = /[{}^_$&~]/g;

const squash = (s: string) => s.replace(/\s+/g, "");

/**
 * Reduce inline math to the symbols a reader would say out loud.
 *
 * Stripping only the `$` delimiters is not enough. `$x$` becomes a useful `x`,
 * but `$\{(x_i, y_i)\}_{i=1}^n$` would keep its backslashes — and since
 * embed_text is full-text indexed as well as embedded, `\times` becomes a
 * searchable token standing for nothing.
 */
export function stripInlineMath(body: string): string {
  return body
    .replace(LATEX_COMMAND, " ")
    .replace(LATEX_PUNCT, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Rewrite a markdown fragment into prose suitable for embedding and FTS. */
export function toEmbedText(markdown: string, page: Page): string {
  const byId = new Map(page.figures.map((f) => [f.id, f]));

  // Keyed by the LaTeX itself, not by position. This runs once per block, so a
  // positional counter would restart at every block and attach the first
  // equation's reading to the second one.
  const byLatex = new Map(
    page.formulas.filter((f) => f.latex).map((f) => [squash(f.latex), f]),
  );

  let text = markdown.replace(DISPLAY_MATH, (_m, body: string) => {
    const formula = byLatex.get(squash(body));
    // No reading available, or the markdown and the extracted LaTeX disagree.
    // Drop it rather than embed raw LaTeX.
    return formula?.plain ? ` ${formula.plain} ` : " ";
  });

  text = text.replace(FIGURE_REF, (_m, id: string) => {
    const fig = byId.get(id);
    if (!fig) return " ";
    const parts = [fig.caption, fig.description, fig.data].filter(Boolean);
    return ` ${parts.join(" ")} `;
  });

  text = text.replace(INLINE_MATH, (_m, body: string) => ` ${stripInlineMath(body)} `);
  text = text.replace(/[#*`>]+/g, " ");
  // Anything left with a backslash never belonged to the prose form.
  text = text.replace(LATEX_COMMAND, " ");
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Split a page into atomic units that must never be cut in half.
 *
 * A block is a heading plus the prose under it, or a paragraph, with any
 * display equation or figure placeholder glued to the paragraph before it.
 */
export function blocks(markdown: string): string[] {
  const raw = markdown
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const b of raw) {
    const isAttachment = DISPLAY_MATH_ONLY.test(b) || FIGURE_REF_ONLY.test(b);
    // A bare heading with nothing under it also belongs to the block that
    // follows rather than standing alone.
    const last = out.at(-1);
    const followsBareHeading = Boolean(last && HEADING.test(last) && last.length < 80);

    if (out.length > 0 && (isAttachment || followsBareHeading)) {
      out[out.length - 1] = `${out.at(-1)}\n\n${b}`;
    } else {
      out.push(b);
    }
  }
  return out;
}

/** Sentence or line boundary — the least damaging place to cut. */
const SOFT_BREAK = /(?<=\n)|(?<=[.!?…])\s+/;

/**
 * Break a block whose embedded form alone exceeds the token budget.
 *
 * A page whose markdown arrives with no blank lines becomes one enormous block,
 * and a single block is never split by the packing loop. Real vision output
 * does this — headings run together inline with no blank lines anywhere.
 *
 * Measured on the embedded form, not the markdown: a figure placeholder is 17
 * characters that becomes several hundred.
 */
export function splitOversized(block: string, page: Page): string[] {
  if (estimateTokens(toEmbedText(block, page), page.lang) <= MAX_TOKENS) {
    return [block];
  }

  const limit = budgetChars(TARGET_TOKENS, page.lang);
  const out: string[] = [];
  let current = "";

  for (let piece of block.split(SOFT_BREAK).filter(Boolean)) {
    if (current && current.length + piece.length > limit) {
      out.push(current.trim());
      current = "";
    }
    // A run with no sentence breaks at all still has to be cut somewhere.
    while (piece.length > limit) {
      out.push(piece.slice(0, limit));
      piece = piece.slice(limit);
    }
    current += piece;
  }

  if (current.trim()) out.push(current.trim());
  return out.filter(Boolean);
}

export function dominantLang(pages: Page[]): Lang {
  const counts: Record<Lang, number> = { en: 0, vi: 0, mixed: 0 };
  for (const p of pages) counts[p.lang] += p.markdown.length;

  if (counts.mixed > Math.max(counts.en, counts.vi)) return "mixed";
  if (counts.en && counts.vi) {
    const ratio =
      Math.min(counts.en, counts.vi) / Math.max(counts.en, counts.vi);
    if (ratio > 0.15) return "mixed";
  }
  return counts.en >= counts.vi ? "en" : "vi";
}

/**
 * Pack page blocks into chunks of roughly TARGET_TOKENS.
 *
 * The budget is measured on the embedded text, not the markdown. Budgeting on
 * markdown produced chunks 40% over MAX_TOKENS in the first real ingest, and
 * only ever on chunks containing figures — exactly the content this project
 * exists to make retrievable.
 */
export function buildChunks(pages: Page[]): Chunk[] {
  const chunks: Chunk[] = [];
  // [display markdown, embedded prose, source page]
  let buf: Array<[string, string, Page]> = [];
  let bufTokens = 0;

  function flush(): void {
    if (buf.length === 0) return;

    const display = buf.map(([d]) => d).join("\n\n");
    const embed = buf
      .map(([, e]) => e)
      .join(" ")
      .trim();
    const pageNos = buf.map(([, , p]) => p.page);
    const lang = dominantLang(buf.map(([, , p]) => p));

    const figIds = new Set(
      buf.flatMap(([d]) => [...d.matchAll(FIGURE_REF)].map((m) => m[1])),
    );
    const seen = new Set<string>();
    const figs: Figure[] = [];
    for (const [, , p] of buf) {
      for (const f of p.figures) {
        if (figIds.has(f.id) && !seen.has(f.id)) {
          seen.add(f.id);
          figs.push(f);
        }
      }
    }

    chunks.push({
      chunk_index: chunks.length,
      page_start: Math.min(...pageNos),
      page_end: Math.max(...pageNos),
      lang,
      display_text: display,
      embed_text: embed,
      has_formula: new RegExp(DISPLAY_MATH.source).test(display),
      has_figure: figs.length > 0,
      figure_refs: figs,
      n_tokens: estimateTokens(embed, lang),
    });

    // Carry the tail block forward as overlap so a question landing on a chunk
    // boundary still finds its context.
    const tail = buf.at(-1)!;
    const tailTokens = estimateTokens(tail[1], lang);
    if (buf.length > 1 && tailTokens <= OVERLAP_TOKENS) {
      buf = [tail];
      bufTokens = tailTokens;
    } else {
      buf = [];
      bufTokens = 0;
    }
  }

  for (const page of pages) {
    if (page.is_boilerplate) continue;
    for (const raw of blocks(page.markdown)) {
      for (const display of splitOversized(raw, page)) {
        const embed = toEmbedText(display, page);
        const t = estimateTokens(embed, page.lang);
        if (buf.length > 0 && bufTokens + t > MAX_TOKENS) flush();
        buf.push([display, embed, page]);
        bufTokens += t;
        if (bufTokens >= TARGET_TOKENS) flush();
      }
    }
  }

  flush();

  // Drop stray fragments, but never a chunk carrying a formula or a figure —
  // those are short by nature and are exactly the content worth retrieving.
  return chunks.filter(
    (c) => c.embed_text.length > 40 || c.has_formula || c.has_figure,
  );
}
