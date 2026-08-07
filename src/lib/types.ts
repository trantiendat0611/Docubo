// Shared contracts for the query path.
// The chunk/figure shapes mirror ingest/pipeline/models.py — change both together.

export type Lang = "en" | "vi" | "mixed";

export interface FigureRef {
  id: string;
  kind: "chart" | "diagram" | "table" | "photo";
  caption: string;
  description: string;
  data: string;
  image_path: string | null;
}

/** One row returned by the hybrid_search RPC. */
export interface RetrievedChunk {
  id: number;
  document_id: string;
  filename: string;
  title: string | null;
  page_start: number;
  page_end: number;
  lang: Lang;
  display_text: string;
  figure_refs: FigureRef[];
  rrf_score: number;
  cosine_sim: number;
}

/**
 * Output of the single pre-retrieval Gemini call. That one call does three jobs
 * at once — safety screening, language detection, and bilingual query expansion
 * — because on a 15 RPM free tier, three separate calls per question is a
 * budget the app does not have.
 */
export interface QueryAnalysis {
  safe: boolean;
  /** Set when safe is false. Surfaced to the user, and logged. */
  reason: "injection" | "off_topic" | "too_long" | null;
  /** Language the answer must be written in. */
  lang: "en" | "vi";
  /** English phrasing, for the fts_en arm. */
  query_en: string;
  /** Vietnamese phrasing, for the fts_vi arm. */
  query_vi: string;
  /** Technical terms worth matching literally, kept in English. */
  keywords: string[];
}

export interface Citation {
  n: number;
  filename: string;
  title: string | null;
  pageStart: number;
  pageEnd: number;
  score: number;
}
