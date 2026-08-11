import { embedMany } from "ai";
import { EMBED_DIM, EMBED_MODEL, gemini } from "../gemini";

import "server-only";

/**
 * Chunk text to vectors. Port of ingest/pipeline/embed.py.
 *
 * Two things that are easy to get wrong and expensive to find late:
 *
 * 1. task type. Gemini produces different vectors depending on whether the text
 *    is a document being stored or a question being asked. Chunks use
 *    RETRIEVAL_DOCUMENT, queries use RETRIEVAL_QUERY. Getting it wrong does not
 *    error — it quietly costs retrieval quality.
 *
 * 2. output dimensionality. Locked to the vector(768) column in the schema.
 *    Changing it means re-embedding everything and altering the column.
 */

const BATCH = 32;

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH) {
    const { embeddings } = await embedMany({
      model: gemini.textEmbeddingModel(EMBED_MODEL, {
        taskType: "RETRIEVAL_DOCUMENT",
        outputDimensionality: EMBED_DIM,
      }),
      values: texts.slice(i, i + BATCH),
    });
    out.push(...embeddings);
  }

  if (out.length !== texts.length) {
    // A silent length mismatch would pair chunks with the wrong vectors, which
    // corrupts retrieval in a way no error ever surfaces.
    throw new Error(
      `embedding count mismatch: ${out.length} vectors for ${texts.length} chunks`,
    );
  }

  return out;
}
