import { embed } from "ai";
import { createClient } from "@supabase/supabase-js";
import { EMBED_DIM, EMBED_MODEL, gemini } from "./gemini";
import type { QueryAnalysis, RetrievedChunk } from "./types";

/**
 * Hybrid retrieval against the hybrid_search RPC.
 *
 * The service_role key is used here, so this module is server-only. Importing
 * it from a client component leaks a key that bypasses row-level security.
 */

export const MATCH_LIMIT = 8;
export const CANDIDATE_LIMIT = 30;
export const RRF_K = 60;

/**
 * Retrieval-score floor. Below this, the corpus does not contain an answer and
 * the app must refuse rather than let the model improvise.
 *
 * This is the single most effective guardrail in the system and it costs
 * nothing. Calibrate it against eval/eval_dataset.json — specifically the
 * `should_refuse` group — do not guess it.
 */
export const MIN_COSINE = 0.35;

function client() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function embedQuery(text: string): Promise<number[]> {
  const { embedding } = await embed({
    // Must match EMBED_MODEL and EMBED_DIM used at ingest, and must use the
    // query task type — chunks were embedded with the document task type.
    model: gemini.textEmbeddingModel(EMBED_MODEL, {
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: EMBED_DIM,
    }),
    value: text,
  });
  return embedding;
}

export async function retrieve(
  analysis: QueryAnalysis,
  original: string,
): Promise<RetrievedChunk[]> {
  // Embed the question as written. The embedding model is multilingual, so the
  // dense arm already crosses languages; re-embedding a translation would spend
  // quota for a marginal gain. Measure before adding it.
  const queryEmbedding = await embedQuery(original);

  const lexEn = [analysis.query_en, ...analysis.keywords].join(" ").trim();
  const lexVi = analysis.query_vi.trim();

  const { data, error } = await client().rpc("hybrid_search", {
    query_embedding: queryEmbedding,
    query_en: lexEn,
    query_vi: lexVi,
    match_limit: MATCH_LIMIT,
    candidate_limit: CANDIDATE_LIMIT,
    rrf_k: RRF_K,
    filter_documents: null,
  });

  if (error) throw new Error(`hybrid_search failed: ${error.message}`);
  return (data ?? []) as RetrievedChunk[];
}

/** True when nothing retrieved is close enough to answer from. */
export function isUngrounded(chunks: RetrievedChunk[]): boolean {
  return chunks.length === 0 || (chunks[0]?.cosine_sim ?? 0) < MIN_COSINE;
}
