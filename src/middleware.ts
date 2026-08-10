import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookie on every request.
 *
 * Access tokens are short-lived. Without this, a user who leaves a tab open
 * gets logged out mid-conversation, and Server Components — which cannot write
 * cookies — have no way to renew it themselves.
 *
 * This does not authorise anything. Route handlers still call currentUser(),
 * and RLS still decides what data exists.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(items) {
          for (const { name, value } of items) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of items) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Touching getUser() is what triggers the refresh. Do not remove it.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets — those never carry a session worth
    // refreshing and would just add latency.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
