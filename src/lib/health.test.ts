import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkDatabase } from "./health";

function fakeClient(error: { message: string } | null, delayMs = 0) {
  let asked: { head?: boolean; count?: string } | undefined;

  const client = {
    from() {
      return {
        async select(_columns: string, options: { head?: boolean; count?: string }) {
          asked = options;
          if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
          return { error };
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, options: () => asked };
}

describe("checkDatabase", () => {
  it("reports ok when the query comes back without an error", async () => {
    const { client } = fakeClient(null);
    const result = await checkDatabase(client);
    expect(result.ok).toBe(true);
  });

  it("reports not ok when the database refuses — the branch that matters", async () => {
    const { client } = fakeClient({ message: "connection refused" });
    const result = await checkDatabase(client);
    expect(result.ok).toBe(false);
  });

  it("asks for no rows, so the endpoint cannot leak the corpus size", async () => {
    const { client, options } = fakeClient(null);
    await checkDatabase(client);
    expect(options()?.head).toBe(true);
  });

  it("times the query rather than reporting a constant", async () => {
    const { client } = fakeClient(null, 20);
    const result = await checkDatabase(client);
    expect(result.ms).toBeGreaterThanOrEqual(15);
  });
});
