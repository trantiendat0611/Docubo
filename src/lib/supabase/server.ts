import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client bound to the signed-in user's session.
 *
 * Use this for every read on the query path. Requests made through it carry the
 * user's JWT, so the row-level policies in db/004_multi_tenant.sql decide what
 * exists — a route handler that forgets to filter by owner gets an empty result
 * rather than someone else's documents.
 *
 * Never use this to write ingest data; that path needs `admin()`.
 */
export async function userClient() {
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
