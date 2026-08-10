import { admin } from "./supabase/admin";

/**
 * Query logging. Fire-and-forget — a logging failure must never break an answer.
 *
 * Written with the service-role client rather than the user's session: the
 * table has RLS on and no policies, so users cannot read the log, including
 * their own rows. It exists for the evaluation chapter, not as a feature.
 *
 * This table is where chapter 4 of the report comes from: refusal rate, how
 * often retrieval came back empty, latency distribution, which language users
 * actually ask in.
 */

export interface QueryLogRow {
  question: string;
  user_id?: string | null;
  question_lang?: string | null;
  blocked_by?: string | null;
  top_score?: number | null;
  n_results?: number | null;
  latency_ms?: number | null;
}

export async function logQuery(row: QueryLogRow): Promise<void> {
  try {
    await admin().from("query_log").insert(row);
  } catch {
    // Intentionally swallowed.
  }
}
