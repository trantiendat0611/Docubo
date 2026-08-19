import { checkDatabase } from "@/lib/health";
import { admin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Liveness check, and the thing that keeps the database awake.
 *
 * Supabase pauses a free project after seven days without activity, and waking
 * it is manual. An app that answers questions all week is never at risk; an app
 * that sits quiet between demos is, and the discovery moment would be the demo
 * itself. A scheduled workflow hits this route twice a week.
 *
 * It must not call Gemini. Generation quota is roughly twenty requests a day per
 * model, so a health check that asked a question would spend a real share of the
 * day's budget on nobody, forever.
 *
 * `force-dynamic` is the load-bearing line. A route handler served from cache
 * would return a cheerful 200 without ever reaching Postgres — which is exactly
 * the failure this route exists to notice, dressed up as success.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const { ok, ms } = await checkDatabase(admin());

  return Response.json(
    { ok, database: ok ? "reachable" : "unreachable", ms },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
