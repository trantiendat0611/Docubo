import { describe, expect, it } from "vitest";
import { buildCitations, generationFailedMessage } from "./prompt";
import type { RetrievedChunk } from "./types";

function chunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    id: 42,
    document_id: "doc-1",
    filename: "test.pdf",
    title: "Test",
    page_start: 3,
    page_end: 3,
    lang: "en",
    display_text: "content",
    figure_refs: [],
    rrf_score: 0.9,
    cosine_sim: 0.812345,
    ...overrides,
  };
}

describe("buildCitations", () => {
  it("carries the chunk id through so the eval harness can reload the exact context", () => {
    const citations = buildCitations([chunk({ id: 42 }), chunk({ id: 7 })]);

    expect(citations[0]).toMatchObject({ n: 1, chunkId: 42 });
    expect(citations[1]).toMatchObject({ n: 2, chunkId: 7 });
  });
});

describe("generationFailedMessage", () => {
  it("tells someone to wait a minute only when something is actually throttled", () => {
    expect(generationFailedMessage("vi", "rate_limited")).toContain("một phút");
    // A timeout is not a rate limit. Nothing is throttled, the model was slow
    // once — sending the user away for a minute would be wrong advice, and it
    // is what this case returned before the timeout branch existed.
    expect(generationFailedMessage("vi", "timeout")).not.toContain("một phút");
    expect(generationFailedMessage("en", "timeout")).not.toContain("minute");
  });

  it("says nothing about tomorrow for a spent day", () => {
    // The budget refills at midnight Pacific, which is the same afternoon in
    // Vietnam. The instant travels in resetAt; the sentence must not guess.
    expect(generationFailedMessage("vi", "daily_quota")).not.toContain("mai");
    expect(generationFailedMessage("en", "daily_quota")).not.toContain("tomorrow");
  });

  it("answers in the language the question was asked in", () => {
    for (const failure of ["daily_quota", "rate_limited", "timeout"] as const) {
      expect(generationFailedMessage("vi", failure)).not.toBe(
        generationFailedMessage("en", failure),
      );
    }
  });
});
