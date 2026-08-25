import { describe, expect, it } from "vitest";
import { DOCX_MIME, IMAGE_MAX_EDGE, fileKind } from "./kinds";

describe("fileKind", () => {
  it("reads the clipboard's MIME rather than its filename", () => {
    // A pasted screenshot arrives named "image.png" at best and unnamed at
    // worst, so the name cannot be what decides.
    expect(fileKind("", "image/png")).toBe("image");
    expect(fileKind("image.png", "image/png")).toBe("image");
    expect(fileKind("Ảnh chụp màn hình 2026-08-21.png", "image/png")).toBe("image");
  });

  it("falls back to the extension when the platform sends no type", () => {
    // Windows in particular hands over an empty `type` for some file pickers.
    expect(fileKind("bang-so-lieu.PNG", "")).toBe("image");
    expect(fileKind("bai-bao.pdf", "")).toBe("pdf");
  });

  it("accepts the three formats a canvas can decode", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      expect(fileKind("x", type)).toBe("image");
    }
    expect(fileKind("x.jpg", "")).toBe("image");
    expect(fileKind("x.jpeg", "")).toBe("image");
  });

  it("refuses HEIC, which uploads happily and then fails to decode", () => {
    // The failure would otherwise land after the upload, at render, with
    // nothing useful to say — createImageBitmap cannot read it outside Safari.
    expect(fileKind("IMG_4821.heic", "image/heic")).toBeNull();
  });

  it("accepts DOCX and TXT as one kind — text", () => {
    expect(fileKind("ghi-chu.txt", "text/plain")).toBe("text");
    expect(fileKind("bao-cao.docx", DOCX_MIME)).toBe("text");
    // Windows file pickers again — MIME can arrive empty.
    expect(fileKind("ghi-chu.txt", "")).toBe("text");
    expect(fileKind("bao-cao.docx", "")).toBe("text");
  });

  it("refuses legacy .doc, which mammoth cannot read", () => {
    // .doc is a different, older binary format — not just a DOCX with a
    // shorter extension. Letting it through would mean a file that uploads
    // and then fails deep inside mammoth instead of cleanly here.
    expect(fileKind("bao-cao-cu.doc", "application/msword")).toBeNull();
  });

  it("refuses everything else rather than guessing", () => {
    expect(fileKind("ghi-chu.rtf", "application/rtf")).toBeNull();
    expect(fileKind("", "")).toBeNull();
  });

  it("keeps the image bound in the same range a PDF page lands in", () => {
    // A4 at 200 dpi is about 1654 x 2339, which is what the vision prompt has
    // been tuned against. Far above that spends body budget for no accuracy.
    expect(IMAGE_MAX_EDGE).toBeGreaterThanOrEqual(1654);
    expect(IMAGE_MAX_EDGE).toBeLessThanOrEqual(2600);
  });
});
