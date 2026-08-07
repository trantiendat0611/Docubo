"""Stage 3 — cached pages to chunks, building both representations.

This is where the project's central idea is implemented. Each chunk carries:

    display_text : markdown, LaTeX intact, figure placeholders intact.
                   Goes to the LLM as context and to KaTeX in the browser.

    embed_text   : the same content as flowing prose. Every display equation is
                   replaced by its spoken reading (Formula.plain), every figure
                   by its description and data readout, inline math loses its
                   delimiters.

Why bother: "\\frac{\\partial L}{\\partial \\theta}" embeds to a near-meaningless
vector, and no Vietnamese or English question will ever retrieve it. The spoken
reading of the same equation embeds like the sentence it is.

Two splitting rules that matter more than the token budget:
  - never cut between a display equation and the paragraph introducing it
  - never cut a figure away from its caption
A chunk that contains a formula with no surrounding explanation is retrievable
but useless as context.
"""

from __future__ import annotations

import re

from .. import config
from ..utils.tokens import estimate_tokens
from .models import Chunk, Figure, Lang, Page

_DISPLAY_MATH = re.compile(r"\$\$(.+?)\$\$", re.DOTALL)
_INLINE_MATH = re.compile(r"(?<!\$)\$([^$\n]+?)\$(?!\$)")
_FIGURE_REF = re.compile(r"\[\[FIGURE:([^\]]+)\]\]")
_HEADING = re.compile(r"^(#{1,6})\s+", re.MULTILINE)


def _to_embed_text(markdown: str, page: Page) -> str:
    """Rewrite a markdown fragment into prose suitable for embedding and FTS."""
    by_id = {f.id: f for f in page.figures}
    formulas = list(page.formulas)
    counter = {"i": 0}

    def swap_display(_m: re.Match[str]) -> str:
        i = counter["i"]
        counter["i"] += 1
        if i < len(formulas) and formulas[i].plain:
            return f" {formulas[i].plain} "
        # No spoken reading available — drop the LaTeX rather than embed it.
        return " "

    def swap_figure(m: re.Match[str]) -> str:
        fig = by_id.get(m.group(1))
        if fig is None:
            return " "
        parts = [p for p in (fig.caption, fig.description, fig.data) if p]
        return " " + " ".join(parts) + " "

    text = _DISPLAY_MATH.sub(swap_display, markdown)
    text = _FIGURE_REF.sub(swap_figure, text)
    text = _INLINE_MATH.sub(lambda m: m.group(1), text)
    text = re.sub(r"[#*`>]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _blocks(markdown: str) -> list[str]:
    """Split a page into atomic units that must never be cut in half.

    A block is a heading plus the prose under it, or a paragraph, with any
    display equation or figure placeholder glued to the paragraph before it.
    """
    raw = [b.strip() for b in re.split(r"\n\s*\n", markdown) if b.strip()]
    out: list[str] = []
    for b in raw:
        is_attachment = bool(_DISPLAY_MATH.fullmatch(b) or _FIGURE_REF.fullmatch(b))
        # A bare heading with nothing under it also belongs to the block that
        # follows rather than standing alone.
        follows_bare_heading = bool(out and _HEADING.match(out[-1]) and len(out[-1]) < 80)
        if out and (is_attachment or follows_bare_heading):
            out[-1] = out[-1] + "\n\n" + b
        else:
            out.append(b)
    return out


def dominant_lang(pages: list[Page]) -> Lang:
    counts = {"en": 0, "vi": 0, "mixed": 0}
    for p in pages:
        counts[p.lang] += len(p.markdown)
    if counts["mixed"] > max(counts["en"], counts["vi"]):
        return "mixed"
    if counts["en"] and counts["vi"]:
        ratio = min(counts["en"], counts["vi"]) / max(counts["en"], counts["vi"])
        if ratio > 0.15:
            return "mixed"
    return "en" if counts["en"] >= counts["vi"] else "vi"


def build_chunks(pages: list[Page]) -> list[Chunk]:
    """Pack page blocks into chunks of roughly TARGET_TOKENS."""
    chunks: list[Chunk] = []
    buf: list[tuple[str, Page]] = []
    buf_tokens = 0

    def flush() -> None:
        nonlocal buf, buf_tokens
        if not buf:
            return

        display = "\n\n".join(b for b, _ in buf)
        embed = " ".join(_to_embed_text(b, p) for b, p in buf).strip()
        page_nos = [p.page for _, p in buf]
        lang = dominant_lang([p for _, p in buf])

        fig_ids = {m for b, _ in buf for m in _FIGURE_REF.findall(b)}
        figs: list[Figure] = [f for _, p in buf for f in p.figures if f.id in fig_ids]
        # dedupe, preserve order
        seen: set[str] = set()
        figs = [f for f in figs if not (f.id in seen or seen.add(f.id))]

        chunks.append(
            Chunk(
                chunk_index=len(chunks),
                page_start=min(page_nos),
                page_end=max(page_nos),
                lang=lang,
                display_text=display,
                embed_text=embed,
                has_formula=bool(_DISPLAY_MATH.search(display)),
                has_figure=bool(figs),
                figure_refs=figs,
                n_tokens=estimate_tokens(embed, lang),
            )
        )

        # Carry the tail block forward as overlap so a question landing on a
        # chunk boundary still finds its context.
        if len(buf) > 1 and estimate_tokens(buf[-1][0], lang) <= config.OVERLAP_TOKENS:
            buf = [buf[-1]]
            buf_tokens = estimate_tokens(buf[0][0], lang)
        else:
            buf = []
            buf_tokens = 0

    for page in pages:
        if page.is_boilerplate:
            continue
        for block in _blocks(page.markdown):
            t = estimate_tokens(block, page.lang)
            if buf and buf_tokens + t > config.MAX_TOKENS:
                flush()
            buf.append((block, page))
            buf_tokens += t
            if buf_tokens >= config.TARGET_TOKENS:
                flush()

    flush()
    # Drop stray fragments, but never a chunk carrying a formula or a figure —
    # those are short by nature (a lead-in sentence plus an equation) and are
    # exactly the content this project exists to make retrievable.
    return [c for c in chunks if len(c.embed_text) > 40 or c.has_formula or c.has_figure]
