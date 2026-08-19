import type { SupabaseClient } from "@supabase/supabase-js";

export interface HealthResult {
  ok: boolean;
  ms: number;
}

/**
 * Ask the database to do something, and time it.
 *
 * Split out of the route for one reason: the failing branch is the branch that
 * matters. A health check that cannot report failure is worse than none, and
 * this project has already shipped one error path that compiled, passed its own
 * tests, and never once fired (§3, trap 14b). A route handler takes no client,
 * so the only way to exercise "database unreachable" is to hand the check its
 * client.
 *
 * `head: true` asks PostgREST for no rows. The query exists to prove Postgres is
 * awake and answering, not to read anything — and a public endpoint has no
 * business reporting how many documents a user owns.
 */
export async function checkDatabase(client: SupabaseClient): Promise<HealthResult> {
  const started = Date.now();
  const { error } = await client.from("documents").select("id", {
    head: true,
    count: "planned",
  });
  return { ok: !error, ms: Date.now() - started };
}
