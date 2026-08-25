import { describe, expect, it } from "vitest";
import { cleanText, detectLang, paginate } from "./paginate";

describe("cleanText", () => {
  it("collapses runs of blank lines and inline whitespace", () => {
    expect(cleanText("a\n\n\n\n\nb")).toBe("a\n\nb");
    expect(cleanText("a    b\t\tc")).toBe("a b c");
  });

  it("strips control characters but keeps newlines", () => {
    expect(cleanText("a\x00\x01b\nc")).toBe("ab\nc");
  });

  it("trims the ends", () => {
    expect(cleanText("  \n hello \n  ")).toBe("hello");
  });
});

describe("detectLang", () => {
  it("reads Vietnamese diacritics as vi, otherwise en", () => {
    expect(detectLang("Xin chào, đây là tài liệu tiếng Việt.")).toBe("vi");
    expect(detectLang("This is a plain English document.")).toBe("en");
  });
});

describe("paginate", () => {
  it("splits only on paragraph boundaries, never mid-paragraph", () => {
    // a+b together (60) fit the 80-char budget; adding c (another 50) would
    // not, so c must start a fresh page rather than being cut into a itself.
    const a = "x".repeat(30);
    const b = "y".repeat(30);
    const c = "z".repeat(50);
    const pages = paginate(`${a}\n\n${b}\n\n${c}`, "en", 80);

    expect(pages.map((p) => p.markdown)).toEqual([`${a}\n\n${b}`, c]);
  });

  it("gives every page a sequential number and the shared lang", () => {
    const pages = paginate("a".repeat(10) + "\n\n" + "b".repeat(10), "vi", 15);
    expect(pages.map((p) => p.page)).toEqual([1, 2]);
    expect(pages.every((p) => p.lang === "vi")).toBe(true);
  });

  it("never force-splits a single paragraph longer than the whole budget", () => {
    // Regression guard against an infinite loop: a paragraph that alone
    // exceeds charsPerPage must still terminate as one oversized page.
    const huge = "w".repeat(500);
    const pages = paginate(huge, "en", 100);

    expect(pages).toHaveLength(1);
    expect(pages[0].markdown).toBe(huge);
  });

  it("packs a paragraph short enough to fit onto the page still under budget", () => {
    const first = "a".repeat(60);
    const second = "b".repeat(30);
    const pages = paginate(`${first}\n\n${second}`, "en", 100);

    expect(pages).toHaveLength(1);
    expect(pages[0].markdown).toBe(`${first}\n\n${second}`);
  });

  it("returns no pages for empty or whitespace-only input", () => {
    expect(paginate("", "en")).toEqual([]);
    expect(paginate("   \n\n  \n ", "en")).toEqual([]);
  });

  it("marks every page as indexable and free of formulas or figures", () => {
    const [page] = paginate("một đoạn văn ngắn", "vi", 100);
    expect(page.is_boilerplate).toBe(false);
    expect(page.formulas).toEqual([]);
    expect(page.figures).toEqual([]);
  });
});
