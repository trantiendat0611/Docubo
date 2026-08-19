import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createConversation } from "./conversations";

function fakeClient({
  user = { id: "user-1" } as { id: string } | null,
  row = { id: "convo-1", title: null, updated_at: "2026-08-19T00:00:00Z" },
  error = null as { message: string } | null,
}) {
  let inserted: Record<string, unknown> | undefined;

  const client = {
    auth: { getUser: async () => ({ data: { user } }) },
    from() {
      return {
        insert(values: Record<string, unknown>) {
          inserted = values;
          return {
            select: () => ({
              single: async () => ({ data: error ? null : row, error }),
            }),
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, inserted: () => inserted };
}

describe("createConversation", () => {
  it("sets owner_id, which the insert policy checks and the column requires", async () => {
    // An empty row fails both, and used to fail silently: only `data` was read,
    // so the button did nothing and said nothing.
    const { client, inserted } = fakeClient({});

    const { conversation, error } = await createConversation(client);

    expect(inserted()).toEqual({ owner_id: "user-1" });
    expect(conversation?.id).toBe("convo-1");
    expect(error).toBeNull();
  });

  it("reports an expired session instead of inserting a row without an owner", async () => {
    const { client, inserted } = fakeClient({ user: null });

    const { conversation, error } = await createConversation(client);

    expect(inserted()).toBeUndefined();
    expect(conversation).toBeNull();
    expect(error).toContain("Phiên đăng nhập");
  });

  it("carries the database message back rather than failing quietly", async () => {
    const { client } = fakeClient({ error: { message: "row-level security" } });

    const { conversation, error } = await createConversation(client);

    expect(conversation).toBeNull();
    expect(error).toContain("row-level security");
  });
});
