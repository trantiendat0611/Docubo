import { describe, expect, it } from "vitest";
import { resolveMentionedDocument } from "./scope";
import type { DocumentSummary } from "./types";

const doc = (partial: Partial<DocumentSummary> & { id: string }): DocumentSummary => ({
  filename: `${partial.id}.pdf`,
  title: null,
  lang: "en",
  n_pages: 10,
  ...partial,
});

const corpus: DocumentSummary[] = [
  doc({ id: "a", filename: "2402.00253v2.pdf", title: "2402.00253v2" }),
  doc({ id: "b", filename: "testta1.pdf", title: "Machine Learning course slides" }),
  doc({ id: "c", filename: "testtv1.pdf", title: "Machine learning va Deep learning", lang: "vi" }),
];

describe("resolving a document named in the question", () => {
  it("matches an arXiv id, which is what the user sees on screen", () => {
    // The failure this exists for: this question previously searched the whole
    // corpus and answered from a different document entirely.
    expect(
      resolveMentionedDocument("Tóm tắt toàn bộ nội dung của tài liệu 2402.00253v2", corpus)?.id,
    ).toBe("a");
  });

  it("matches a filename with its extension", () => {
    expect(resolveMentionedDocument("có gì trong testtv1.pdf", corpus)?.id).toBe("c");
  });

  it("prefers the longest matching name", () => {
    // Two titles start with the same words; the question names the longer one.
    expect(
      resolveMentionedDocument("tóm tắt Machine learning va Deep learning", corpus)?.id,
    ).toBe("c");
  });

  it("returns null when no document is named", () => {
    expect(resolveMentionedDocument("gradient descent hoạt động thế nào", corpus)).toBeNull();
  });

  it("ignores names too short to match on purpose", () => {
    const short: DocumentSummary[] = [doc({ id: "x", filename: "ml.pdf", title: "ML" })];
    // "ml" appears inside "html", "normal", countless words. A two-letter
    // title matching would scope questions to the wrong document constantly.
    expect(resolveMentionedDocument("giải thích html cơ bản", short)).toBeNull();
  });

  it("is case insensitive", () => {
    expect(resolveMentionedDocument("summarise MACHINE LEARNING COURSE SLIDES", corpus)?.id).toBe("b");
  });
});
