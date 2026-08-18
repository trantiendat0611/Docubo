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

Measured later and only half right: the vector barely moves, under 0.03 cosine
either way. What the control sequences actually ruin is the full-text index,
where they stem to tokens like 'langl' and 'rangl' that appear in no question
anyone asks. Right decision, wrong reason. See SKILL_MY_PROJECT.md 1.2.

Two splitting rules that matter more than the token budget:
  - never cut between a display equation and the paragraph introducing it
  - never cut a figure away from its caption
A chunk that contains a formula with no surrounding explanation is retrievable
but useless as context.
"""

from __future__ import annotations

import re

from .. import config
from ..utils.tokens import budget_chars, estimate_tokens
from .models import Chunk, Figure, Lang, Page

_DISPLAY_MATH = re.compile(r"\$\$(.+?)\$\$", re.DOTALL)
_INLINE_MATH = re.compile(r"(?<!\$)\$([^$\n]+?)\$(?!\$)")
_FIGURE_REF = re.compile(r"\[\[FIGURE:([^\]]+)\]\]")
_HEADING = re.compile(r"^(#{1,6})\s+", re.MULTILINE)


def _squash(s: str) -> str:
    return re.sub(r"\s+", "", s)


#: LaTeX control sequences, and the punctuation that only exists to drive them.
_LATEX_COMMAND = re.compile(r"\\[a-zA-Z]+\s*|\\.")
_LATEX_PUNCT = re.compile(r"[{}^_$&~]")


def _strip_inline_math(body: str) -> str:
    """Reduce inline math to the symbols a reader would say out loud.

    Stripping only the `$` delimiters is not enough. `$x$` becomes a useful
    `x`, but `$\\{(x_i, y_i)\\}_{i=1}^n$` becomes `\\{(x_i, y_i)\\}_{i=1}^n` —
    and since embed_text is full-text indexed as well as embedded, `\\times`
    ends up as a searchable token. Control sequences go, the identifiers stay.
    """
    text = _LATEX_COMMAND.sub(" ", body)
    text = _LATEX_PUNCT.sub(" ", text)
    return re.sub(r"\s+", " ", text).strip()


def _to_embed_text(markdown: str, page: Page) -> str:
    """Rewrite a markdown fragment into prose suitable for embedding and FTS."""
    by_id = {f.id: f for f in page.figures}
    # Keyed by the LaTeX itself, not by position.
    #
    # This function is called once per block, so a positional counter restarts
    # at every block: a page whose second block holds the second equation would
    # get the first equation's spoken reading attached to it. Matching on
    # content is stable however the page is split.
    by_latex = {_squash(f.latex): f for f in page.formulas if f.latex}

    def swap_display(m: re.Match[str]) -> str:
        formula = by_latex.get(_squash(m.group(1)))
        if formula is not None and formula.plain:
            return f" {formula.plain} "
        # No spoken reading available, or the markdown and the extracted LaTeX
        # disagree. Drop it rather than embed raw LaTeX, which is the whole
        # point of the dual representation.
        return " "

    def swap_figure(m: re.Match[str]) -> str:
        fig = by_id.get(m.group(1))
        if fig is None:
            return " "
        parts = [p for p in (fig.caption, fig.description, fig.data) if p]
        return " " + " ".join(parts) + " "

    text = _DISPLAY_MATH.sub(swap_display, markdown)
    text = _FIGURE_REF.sub(swap_figure, text)
    text = _INLINE_MATH.sub(lambda m: f" {_strip_inline_math(m.group(1))} ", text)
    text = re.sub(r"[#*`>]+", " ", text)
    # Anything left with a backslash never belonged to the prose form.
    text = _LATEX_COMMAND.sub(" ", text)
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


#: Sentence or line boundary — the least damaging place to cut a block that has
#: no paragraph breaks at all.
_SOFT_BREAK = re.compile(r"(?<=\n)|(?<=[.!?…])\s+")


def _split_oversized(block: str, page: Page) -> list[str]:
    """Break a block whose embedded form alone exceeds the token budget.

    `_blocks` splits on blank lines, so a page whose markdown arrives with no
    blank lines becomes one enormous block — and a single block is never split
    by the packing loop, so it would be emitted as one oversized chunk. That
    wrecks retrieval precision and can overflow the prompt.

    Real output that does this: the fallback vision model sometimes returns a
    page with headings run together inline and no blank lines anywhere.

    Measured on the embedded form, not the markdown, for the reason described
    in build_chunks: a figure placeholder is 17 characters that becomes several
    hundred.

    Cutting here can separate a formula from its explanation, which the block
    rules otherwise prevent. That is the lesser harm — the alternative is a
    chunk several times over budget.

    One case this cannot fix: a single figure whose description alone exceeds
    the budget. The placeholder is atomic, so whichever piece holds it still
    expands past the limit. Accepted — splitting a figure from its own caption
    would be worse than an oversized chunk.
    """
    if estimate_tokens(_to_embed_text(block, page), page.lang) <= config.MAX_TOKENS:
        return [block]

    limit = budget_chars(config.TARGET_TOKENS, page.lang)
    out: list[str] = []
    current = ""

    for piece in filter(None, _SOFT_BREAK.split(block)):
        if current and len(current) + len(piece) > limit:
            out.append(current.strip())
            current = ""
        # A run with no sentence breaks at all still has to be cut somewhere.
        while len(piece) > limit:
            out.append(piece[:limit])
            piece = piece[limit:]
        current += piece

    if current.strip():
        out.append(current.strip())
    return [b for b in out if b]


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
    """Pack page blocks into chunks of roughly TARGET_TOKENS.

    The budget is measured on the *embedded* text, not the markdown. Those two
    lengths are not close: `[[FIGURE:fig-2-1]]` is 17 characters of markdown
    that becomes several hundred characters of description in embed_text.
    Budgeting on the markdown produced chunks 40% over MAX_TOKENS in the first
    real ingest — and only ever on chunks containing figures, which is exactly
    the content this project exists to make retrievable.

    embed_text is what gets embedded and full-text indexed, so embed_text is
    what the budget has to be about.
    """
    chunks: list[Chunk] = []
    # (display markdown, embedded prose, source page)
    buf: list[tuple[str, str, Page]] = []
    buf_tokens = 0

    def flush() -> None:
        nonlocal buf, buf_tokens
        if not buf:
            return

        display = "\n\n".join(d for d, _, _ in buf)
        embed = " ".join(e for _, e, _ in buf).strip()
        page_nos = [p.page for _, _, p in buf]
        lang = dominant_lang([p for _, _, p in buf])

        fig_ids = {m for d, _, _ in buf for m in _FIGURE_REF.findall(d)}
        figs: list[Figure] = [f for _, _, p in buf for f in p.figures if f.id in fig_ids]
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
        tail_tokens = estimate_tokens(buf[-1][1], lang)
        if len(buf) > 1 and tail_tokens <= config.OVERLAP_TOKENS:
            buf = [buf[-1]]
            buf_tokens = tail_tokens
        else:
            buf = []
            buf_tokens = 0

    for page in pages:
        if page.is_boilerplate:
            continue
        raw_blocks = _blocks(page.markdown)
        for display in (s for b in raw_blocks for s in _split_oversized(b, page)):
            embed = _to_embed_text(display, page)
            t = estimate_tokens(embed, page.lang)
            if buf and buf_tokens + t > config.MAX_TOKENS:
                flush()
            buf.append((display, embed, page))
            buf_tokens += t
            if buf_tokens >= config.TARGET_TOKENS:
                flush()

    flush()
    # Drop stray fragments, but never a chunk carrying a formula or a figure —
    # those are short by nature (a lead-in sentence plus an equation) and are
    # exactly the content this project exists to make retrievable.
    return [c for c in chunks if len(c.embed_text) > 40 or c.has_formula or c.has_figure]
