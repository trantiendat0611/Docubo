// Mirror of ingest/pipeline/models.py. The two pipelines write the same page
// cache and must produce identical chunks — change both together, and keep the
// chunker tests in step on both sides.

export type Lang = "en" | "vi" | "mixed";

export interface Formula {
  id: string;
  latex: string;
  /** Spoken reading in the page's own language. This is what reaches embed_text. */
  plain: string;
}

export interface Figure {
  id: string;
  kind: "chart" | "diagram" | "table" | "photo";
  caption: string;
  description: string;
  data: string;
  image_path?: string | null;
}

/** Exactly what the vision model is asked to return. */
export interface PageExtraction {
  page: number;
  lang: Lang;
  is_boilerplate: boolean;
  markdown: string;
  formulas: Formula[];
  figures: Figure[];
}

/** A cached page: the extraction plus how it was produced. */
export interface Page extends PageExtraction {
  extracted_by?: string;
}

export interface Chunk {
  chunk_index: number;
  page_start: number;
  page_end: number;
  lang: Lang;
  /** Markdown with LaTeX intact. Goes to the LLM and to KaTeX. */
  display_text: string;
  /** Prose only. Formulas replaced by their reading, figures by descriptions. */
  embed_text: string;
  has_formula: boolean;
  has_figure: boolean;
  figure_refs: Figure[];
  n_tokens: number;
}

export function emptyPage(partial: Partial<Page> & { page: number }): Page {
  return {
    lang: "en",
    is_boilerplate: false,
    markdown: "",
    formulas: [],
    figures: [],
    ...partial,
  };
}
