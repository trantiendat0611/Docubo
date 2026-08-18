import { describe, expect, it } from "vitest";
import { buildCitations } from "./prompt";
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
