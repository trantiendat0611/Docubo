import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";

/**
 * Supabase client bound to the caller's session.
 *
 * Use this for every read on the query path. Requests made through it carry the
 * user's JWT, so the row-level policies in db/004_multi_tenant.sql decide what
 * exists — a route handler that forgets to filter by owner gets an empty result
 * rather than someone else's documents.
 *
 * Two ways to present a session:
 *
 *   cookies   the browser, managed by @supabase/ssr and the middleware.
 *   bearer    `Authorization: Bearer <access_token>`, for anything that is not
 *             a browser. The evaluation harness needs this to call /api/chat,
 *             and it is what makes the routes testable without driving a real
 *             session through a headless browser.
 *
 * Never use either to write ingest data; that path needs `admin()`.
 */
export async function userClient() {
  const bearer = (await headers()).get("authorization");

  if (bearer?.toLowerCase().startsWith("bearer ")) {
    // The token travels on every request this client makes, so RLS applies
    // exactly as it does for a cookie session.
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: bearer } },
      },
    );
  }

  const store = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return store.getAll();
        },
        setAll(items) {
          try {
            for (const { name, value, options } of items) {
              store.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // The middleware refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  );
}

/** The signed-in user, or null. */
export async function currentUser() {
  const supabase = await userClient();
  // getUser() revalidates the token with Supabase. getSession() only decodes
  // the cookie, which the browser could have tampered with — never trust it for
  // an authorisation decision.
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}
