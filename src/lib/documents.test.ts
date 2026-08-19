import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteDocument } from "./documents";

/**
 * A Supabase client that records the calls that matter.
 *
 * The point of the test is ordering: the storage path has to be read while the
 * job row still exists, and the row has to go before the file. A fake that logs
 * the sequence is what makes that checkable — mocking the network would not.
 */
function fakeClient(jobs: { storage_path: string | null }[] | null) {
  const calls: string[] = [];
  const removed: string[][] = [];

  const client = {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              calls.push(`select ${table}`);
              return Promise.resolve({ data: jobs });
            },
          };
        },
        delete() {
          return {
            eq() {
              calls.push(`delete ${table}`);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
    storage: {
      from(bucket: string) {
        return {
          remove(paths: string[]) {
            calls.push(`remove ${bucket}`);
            removed.push(paths);
            return Promise.resolve({ error: null });
          },
        };
      },
    },
  } as unknown as SupabaseClient;

  return { client, calls, removed };
}

describe("deleteDocument", () => {
  it("reads the path before the delete, and removes the file after it", async () => {
    const { client, calls, removed } = fakeClient([
      { storage_path: "user-1/1786434133994-paper.pdf" },
    ]);

    const result = await deleteDocument(client, "doc-1");

    expect(calls).toEqual(["select ingest_jobs", "delete documents", "remove documents"]);
    expect(removed).toEqual([["user-1/1786434133994-paper.pdf"]]);
    expect(result.removedFiles).toBe(1);
  });

  it("still deletes the row for a document the CLI ingested, which has no file", async () => {
    const { client, calls, removed } = fakeClient([]);

    const result = await deleteDocument(client, "doc-2");

    expect(calls).toEqual(["select ingest_jobs", "delete documents"]);
    expect(removed).toEqual([]);
    expect(result.removedFiles).toBe(0);
  });

  it("does not call storage when the job row carries no path", async () => {
    const { client, calls } = fakeClient([{ storage_path: null }]);

    await deleteDocument(client, "doc-3");

    expect(calls).not.toContain("remove documents");
  });

  it("survives a query that comes back null rather than empty", async () => {
    const { client } = fakeClient(null);

    await expect(deleteDocument(client, "doc-4")).resolves.toEqual({ removedFiles: 0 });
  });

  it("removes every file when a document was ingested more than once", async () => {
    const { client, removed } = fakeClient([
      { storage_path: "user-1/first.pdf" },
      { storage_path: "user-1/second.pdf" },
    ]);

    const result = await deleteDocument(client, "doc-5");

    expect(removed).toEqual([["user-1/first.pdf", "user-1/second.pdf"]]);
    expect(result.removedFiles).toBe(2);
  });
});
