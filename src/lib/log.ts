import { createClient } from "@supabase/supabase-js";

/**
 * Query logging. Fire-and-forget — a logging failure must never break an answer.
 *
 * This table is where chapter 4 of the report comes from: refusal rate, how
 * often retrieval came back empty, latency distribution, which language users
 * actually ask in.
 */

export interface QueryLogRow {
  question: string;
  question_lang?: string | null;
  blocked_by?: string | null;
  top_score?: number | null;
  n_results?: number | null;
  latency_ms?: number | null;
}

export async function logQuery(row: QueryLogRow): Promise<void> {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
      { auth: { persistSession: false } },
    );
    await supabase.from("query_log").insert(row);
  } catch {
    // Intentionally swallowed.
  }
}
