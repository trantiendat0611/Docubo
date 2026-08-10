import { createGoogleGenerativeAI } from "@ai-sdk/google";

/**
 * The Gemini provider for the whole app.
 *
 * Import this rather than `@ai-sdk/google`'s default `google` export. The
 * default instance reads `GOOGLE_GENERATIVE_AI_API_KEY`, but the ingest
 * pipeline reads `GEMINI_API_KEY` — two names for one key is a trap that costs
 * an afternoon the first time someone sets only one of them. Passing the key
 * explicitly keeps a single variable across Python and TypeScript.
 */
export const gemini = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export const CHAT_MODEL = process.env.GEMINI_CHAT_MODEL ?? "gemini-3.5-flash";
export const EMBED_MODEL =
  process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001";

/** Locked to the vector(768) column in db/001_schema.sql. */
export const EMBED_DIM = 768;
