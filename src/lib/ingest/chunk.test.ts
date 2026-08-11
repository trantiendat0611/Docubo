import { describe, expect, it } from "vitest";
import { MAX_TOKENS } from "./config";
import { buildChunks, toEmbedText } from "./chunk";
import { emptyPage } from "./types";
import type { Figure, Formula, Page } from "./types";

// Ported from ingest/tests/test_chunk.py. Every case here corresponds to one
// there, because the CLI and the upload path must produce identical chunks from
// the same document — otherwise an eval measured through one says nothing about
// the other.

const page = (partial: Partial<Page> = {}): Page =>
  emptyPage({ page: 1, lang: "vi", ...partial });

const formula = (p: Partial<Formula> = {}): Formula => ({
  id: "eq-1-1",
  latex: "",
  plain: "",
  ...p,
});

const figure = (p: Partial<Figure> = {}): Figure => ({
  id: "fig-1-1",
  kind: "chart",
  caption: "",
  description: "",
  data: "",
  ...p,
});

describe("dual representation", () => {
  it("turns a display equation into its spoken reading", () => {
    const p = page({
      markdown: "Hàm mất mát được định nghĩa:\n\n$$L = \\frac{1}{n}\\sum e_i^2$$",
      formulas: [
        formula({
          latex: "L = \\frac{1}{n}\\sum e_i^2",
          plain: "Hàm mất mát bằng trung bình bình phương sai số trên n mẫu.",
        }),
      ],
    });

    const out = toEmbedText(p.markdown, p);

    expect(out).toContain("trung bình bình phương sai số");
    // Raw LaTeX must not survive — that is the whole point.
    expect(out).not.toContain("\\frac");
    expect(out).not.toContain("$$");
  });

  it("replaces a figure placeholder with its description", () => {
    const p = page({
      markdown: "Xem biểu đồ dưới đây.\n\n[[FIGURE:fig-1-1]]",
      figures: [
        figure({
          caption: "Đường cong mất mát",
          description: "Loss giảm dần theo epoch.",
          data: "epoch 0: 2.4, epoch 50: 0.3",
        }),
      ],
    });

    const out = toEmbedText(p.markdown, p);

    expect(out).toContain("Đường cong mất mát");
    expect(out).toContain("epoch 50: 0.3");
    expect(out).not.toContain("[[FIGURE");
  });

  it("keeps the LaTeX in display_text", () => {
    const p = page({
      markdown: "Định nghĩa:\n\n$$e = mc^2$$",
      formulas: [formula({ latex: "e = mc^2", plain: "Năng lượng bằng..." })],
    });

    const chunks = buildChunks([p]);

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].display_text).toContain("$$e = mc^2$$");
    expect(chunks[0].has_formula).toBe(true);
  });

  it("gives each formula its own reading", () => {
    // A positional counter restarts at every block, so both equations resolved
    // to formulas[0].
    const p = page({
      lang: "en",
      markdown:
        "The loss is defined as follows.\n\n$$L = \\frac{1}{n}\\sum e_i^2$$\n\n" +
        "The gradient is then.\n\n$$g = \\nabla_\\theta L$$",
      formulas: [
        formula({
          id: "eq-1-1",
          latex: "L = \\frac{1}{n}\\sum e_i^2",
          plain: "MEAN SQUARED ERROR",
        }),
        formula({ id: "eq-1-2", latex: "g = \\nabla_\\theta L", plain: "GRADIENT OF THE LOSS" }),
      ],
    });

    const all = buildChunks([p])
      .map((c) => c.embed_text)
      .join(" ");

    expect(all).toContain("MEAN SQUARED ERROR");
    expect(all).toContain("GRADIENT OF THE LOSS");
    expect(all.split("MEAN SQUARED ERROR").length - 1).toBe(1);
  });

  it("keeps inline symbols but drops LaTeX control sequences", () => {
    // Real output: `\times` survived into embed_text, which is full-text
    // indexed, so `times` became a searchable token meaning nothing.
    const p = page({
      lang: "en",
      markdown:
        "Given $\\{(x_i, y_i)\\}_{i=1}^n$ drawn from $P$ on $X \\times Y$, we build $F$.",
    });

    const out = toEmbedText(p.markdown, p);

    expect(out).not.toContain("\\");
    expect(out).not.toContain("times");
    for (const symbol of ["x", "y", "P", "X", "Y", "F"]) {
      expect(out).toContain(symbol);
    }
  });
});

describe("block rules", () => {
  it("skips boilerplate pages", () => {
    const chunks = buildChunks([
      page({ page: 1, is_boilerplate: true, markdown: "# Mục lục\n\nChương 1 ... 5" }),
      page({ page: 2, markdown: "Nội dung thật, đủ dài để tạo thành một chunk hợp lệ." }),
    ]);

    expect(chunks.every((c) => c.page_start === 2)).toBe(true);
  });

  it("keeps a formula with the paragraph that introduces it", () => {
    const p = page({
      markdown:
        "Ta định nghĩa hàm mất mát như sau, với n là số mẫu trong tập huấn luyện.\n\n" +
        "$$L = \\frac{1}{n}\\sum e_i^2$$",
      formulas: [formula({ latex: "L", plain: "Hàm mất mát." })],
    });

    const chunks = buildChunks([p]);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].display_text).toContain("số mẫu");
    expect(chunks[0].display_text).toContain("$$");
  });

  it("leaves a page within budget alone", () => {
    const chunks = buildChunks([
      page({ lang: "en", markdown: "First paragraph here.\n\nSecond paragraph here." }),
    ]);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].display_text).toContain("First paragraph");
    expect(chunks[0].display_text).toContain("Second paragraph");
  });
});

describe("token budget", () => {
  it("splits a page that arrives with no blank lines", () => {
    const sentence = "Machine learning la mot linh vuc cua tri tue nhan tao. ";
    const chunks = buildChunks([page({ lang: "vi", markdown: sentence.repeat(200) })]);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.filter((c) => c.n_tokens > MAX_TOKENS)).toHaveLength(0);
  });

  it("counts the expanded figure text, not the placeholder", () => {
    // `[[FIGURE:x]]` is 17 characters that becomes hundreds once embedded.
    // Budgeting on the markdown packed two figure pages into one oversized chunk.
    const description = "Mo ta chi tiet ve bieu do. ".repeat(60);
    const figurePage = (n: number) =>
      page({
        page: n,
        lang: "vi",
        markdown: `Doan van ngan tren trang ${n}.\n\n[[FIGURE:fig-${n}-1]]`,
        figures: [figure({ id: `fig-${n}-1`, caption: `Bieu do ${n}`, description })],
      });

    const chunks = buildChunks([figurePage(1), figurePage(2)]);

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.filter((c) => c.n_tokens > MAX_TOKENS)).toHaveLength(0);
  });
});
