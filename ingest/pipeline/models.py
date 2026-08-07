"""Data contracts shared across pipeline stages.

Mirrored on the TypeScript side in src/lib/types.ts — change both together.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Lang = Literal["en", "vi", "mixed"]


class Formula(BaseModel):
    id: str
    latex: str
    #: Spoken reading of the formula, in the page's own language. This is what
    #: reaches embed_text — the LaTeX itself does not.
    plain: str


class Figure(BaseModel):
    id: str
    kind: Literal["chart", "diagram", "table", "photo"]
    caption: str = ""
    description: str = ""
    data: str = ""
    #: Filled in by the pipeline, not the model: path to the cropped or full
    #: page image backing this figure.
    image_path: str | None = None


class Page(BaseModel):
    """One page as returned by the vision model. Cached verbatim to disk."""

    page: int
    lang: Lang
    is_boilerplate: bool = False
    markdown: str
    formulas: list[Formula] = Field(default_factory=list)
    figures: list[Figure] = Field(default_factory=list)


class Chunk(BaseModel):
    """A retrievable unit. Carries both representations."""

    chunk_index: int
    page_start: int
    page_end: int
    lang: Lang

    #: Markdown with LaTeX intact. Goes to the LLM and to KaTeX.
    display_text: str
    #: Prose only. Formulas replaced by Formula.plain, figures by their
    #: description. This is what gets embedded and full-text indexed.
    embed_text: str

    has_formula: bool = False
    has_figure: bool = False
    figure_refs: list[Figure] = Field(default_factory=list)
    n_tokens: int = 0


class Document(BaseModel):
    filename: str
    title: str | None = None
    source_url: str | None = None
    lang: Lang
    n_pages: int
    content_hash: str
