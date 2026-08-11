import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Integration tests against the real Gemini and Supabase.
 *
 * Skipped unless RUN_LIVE=1, because they spend daily vision quota and write to
 * the database. `npm test` stays fast and free; this is the deliberate check
 * that the TypeScript ingest path actually works before any of it is wired to a
 * route.
 *
 * Run:
 *   $env:RUN_LIVE=1
 *   npx vitest run live
 *
 * Needs data/pages/testta1/*.png, which the Python CLI produces.
 */

const live = process.env.RUN_LIVE === "1";
const PAGES = join(process.cwd(), "data", "pages", "testta1");
const havePages = existsSync(PAGES);

function pageImage(n: number) {
  return {
    page: n,
    bytes: new Uint8Array(readFileSync(join(PAGES, `p${String(n).padStart(4, "0")}.png`))),
  };
}

describe.skipIf(!live || !havePages)("ingest against live services", () => {
  it("extracts a batch of pages and labels them correctly", async () => {
    const { extractBatch } = await import("./vision");

    const wanted = [41, 42, 43, 44];
    const found = await extractBatch(wanted.map(pageImage));

    // Page attribution is what every citation depends on, so it is the first
    // thing to assert.
    expect([...found.keys()].sort((a, b) => a - b)).toEqual(wanted);

    for (const page of found.values()) {
      expect(page.markdown.length).toBeGreaterThan(0);
      expect(["en", "vi", "mixed"]).toContain(page.lang);
      expect(page.extracted_by).toBeTruthy();
    }

    // Page 44 is the graphical-models page: two display equations.
    const p44 = found.get(44)!;
    expect(p44.formulas.length).toBeGreaterThanOrEqual(1);
    expect(p44.formulas[0].latex).toContain("\\");
    expect(p44.formulas[0].plain.length).toBeGreaterThan(20);
  });

  it("embeds at the dimension the schema expects", async () => {
    const { embedDocuments } = await import("./embed");

    const vectors = await embedDocuments([
      "Machine learning la mot linh vuc cua tri tue nhan tao.",
      "A directed graphical model factorises as a product of conditionals.",
    ]);

    expect(vectors).toHaveLength(2);
    // Must match vector(768) in db/001_schema.sql.
    expect(vectors[0]).toHaveLength(768);
    expect(vectors[1]).toHaveLength(768);
    expect(vectors[0].some((v) => v !== 0)).toBe(true);
  });

  it("round-trips a job through the page cache and cleans up", async () => {
    const { createJob, savePages, loadPages, extractedPageNumbers } = await import(
      "./store"
    );
    const { admin } = await import("../supabase/admin");

    const ownerId = process.env.INGEST_OWNER_ID;
    expect(ownerId, "INGEST_OWNER_ID must be set in .env").toBeTruthy();

    const job = await createJob({
      ownerId: ownerId!,
      filename: "live-test.pdf",
      storagePath: `${ownerId}/live-test/live-test.pdf`,
      nPages: 2,
    });

    try {
      await savePages(job.id, ownerId!, [
        {
          page: 1,
          lang: "en",
          is_boilerplate: false,
          markdown: "First page of the live round trip.",
          formulas: [],
          figures: [],
          extracted_by: "test",
        },
      ]);

      // Repeating a batch must be idempotent — a client that loses its
      // connection mid-step will resend it.
      await savePages(job.id, ownerId!, [
        {
          page: 1,
          lang: "en",
          is_boilerplate: false,
          markdown: "First page of the live round trip.",
          formulas: [],
          figures: [],
          extracted_by: "test",
        },
      ]);

      expect(await extractedPageNumbers(job.id)).toEqual(new Set([1]));

      const pages = await loadPages(job.id);
      expect(pages).toHaveLength(1);
      expect(pages[0].markdown).toBe("First page of the live round trip.");
    } finally {
      // Deleting the job cascades to document_pages.
      await admin().from("ingest_jobs").delete().eq("id", job.id);
    }
  });
});
