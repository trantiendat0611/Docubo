"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser client. Holds the anon key, which is designed to be public — the
 * row-level policies are what keep one user's corpus away from another.
 */
export function browserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
