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

/**
 * Chat models, tried in order.
 *
 * Free tier grants requests-per-day **per model** — measured at 20 for
 * gemini-3.5-flash — so a single model is a single day's worth of questions for
 * every user combined. The ingest path has rotated models since the day that
 * limit was discovered; the chat path did not, and an eval run exhausted it
 * mid-way. What made that expensive was not the exhaustion but how it looked:
 * query analysis fell back to the raw question and quietly lost cross-lingual
 * retrieval, and generation returned HTTP 200 with an empty body.
 *
 * Order by answer quality — the first entry handles the bulk of traffic.
 */
const DEFAULT_CHAT_MODELS = [
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
];

/**
 * GEMINI_CHAT_MODEL, the older singular variable, promotes one model to the
 * front rather than replacing the list.
 *
 * Reading it as the whole chain looks reasonable and quietly removes rotation
 * for anyone with an existing .env — which is what happened here: rotation was
 * built, tested, and never ran, because a leftover single-model setting won the
 * fallback and left a chain of one.
 */
export const CHAT_MODELS = [
  ...new Set(
    [
      ...(process.env.GEMINI_CHAT_MODELS ?? process.env.GEMINI_CHAT_MODEL ?? "")
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean),
      ...DEFAULT_CHAT_MODELS,
    ],
  ),
];

/** Kept for callers that only need a name to report. */
export const CHAT_MODEL = CHAT_MODELS[0];

export const EMBED_MODEL =
  process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001";

/** Locked to the vector(768) column in db/001_schema.sql. */
export const EMBED_DIM = 768;

/**
 * Models that have spent their daily budget.
 *
 * Module scope, so it lasts as long as the warm serverless instance and no
 * longer. The quota resets overnight; persisting this would keep a model
 * retired after it had recovered.
 */
const exhausted = new Set<string>();

const DAILY_QUOTA_ID = "GenerateRequestsPerDayPerProjectPerModel";

/**
 * True when the model's requests-per-DAY budget is gone, not a rate limit.
 *
 * The quota id has to be dug out of the error rather than read off it. The AI
 * SDK wraps failures in an AI_RetryError whose message is truncated well before
 * the interesting part; the identifier survives only in
 * `errors[n].responseBody`. Matching on `String(error)` looks correct, compiles,
 * and silently never fires — which is exactly what happened: rotation was in
 * place and never rotated, so every request kept hitting the exhausted model.
 */
export function isDailyQuota(error: unknown): boolean {
  const seen = new Set<unknown>();

  const walk = (value: unknown, depth: number): boolean => {
    if (depth > 4 || value == null) return false;
    if (typeof value === "string") return value.includes(DAILY_QUOTA_ID);
    if (typeof value !== "object" || seen.has(value)) return false;
    seen.add(value);

    if (Array.isArray(value)) return value.some((v) => walk(v, depth + 1));

    const record = value as Record<string, unknown>;
    return ["errors", "lastError", "cause", "responseBody", "data", "message"].some(
      (key) => walk(record[key], depth + 1),
    );
  };

  return walk(error, 0);
}

/**
 * Retries are left to the model chain, not the SDK.
 *
 * By default the SDK retries a 429 three times. Against a daily quota those
 * three attempts cannot succeed and each one still counts, so a single doomed
 * call costs three of the twenty requests a model gets per day. Rotating to
 * another model is both cheaper and the only thing that actually recovers.
 */
export const NO_SDK_RETRIES = { maxRetries: 0 } as const;

/**
 * When the per-day budget next refills.
 *
 * Google resets these at midnight Pacific, which is not midnight anywhere the
 * users are — in Vietnam it lands at 14:00 the same afternoon. Telling someone
 * to come back "tomorrow" therefore costs them most of a day they did not need
 * to wait, so the server returns the instant and lets the client say it in
 * local time.
 *
 * Derived from the wall clock in Los Angeles rather than a fixed offset, so it
 * follows daylight saving. On the two transition days itself it can be an hour
 * out, which is close enough for a "try again after" hint.
 */
export function nextQuotaReset(now: Date = new Date()): Date {
  const [h, m, s] = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(now)
    .split(":")
    .map(Number);

  const secondsIntoDay = h * 3600 + m * 60 + s;
  return new Date(now.getTime() + (86_400 - secondsIntoDay) * 1000);
}

export function availableChatModels(): string[] {
  const remaining = CHAT_MODELS.filter((m) => !exhausted.has(m));
  // All spent: let the caller try the first one anyway and surface the real
  // error, rather than failing with a confusing "no models" of our own.
  return remaining.length > 0 ? remaining : CHAT_MODELS.slice(0, 1);
}

export class AllChatModelsExhausted extends Error {
  constructor() {
    super("every configured chat model has spent its daily request quota");
    this.name = "AllChatModelsExhausted";
  }
}

/**
 * Run `attempt` against each chat model until one succeeds.
 *
 * Only daily-quota failures rotate. Anything else is a real fault and must
 * reach the caller rather than being retried three more times against models
 * that will fail the same way.
 */
export async function withChatModel<T>(
  attempt: (model: string) => Promise<T>,
): Promise<{ result: T; model: string }> {
  let lastError: unknown;

  for (const model of availableChatModels()) {
    try {
      return { result: await attempt(model), model };
    } catch (error) {
      if (!isDailyQuota(error)) throw error;
      exhausted.add(model);
      lastError = error;
    }
  }

  throw lastError instanceof Error ? new AllChatModelsExhausted() : lastError;
}
