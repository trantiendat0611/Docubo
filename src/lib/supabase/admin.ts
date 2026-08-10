import { createClient } from "@supabase/supabase-js";

import "server-only";

/**
 * Service-role client. Bypasses row-level security entirely.
 *
 * Only the ingest path should touch this, and every write it makes must set
 * owner_id explicitly — RLS is not there to catch mistakes on this side.
 *
 * The `server-only` import makes importing this from a client component a build
 * error rather than a key leak.
 */
export function admin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
