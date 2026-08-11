import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildChunks } from "./chunk";
import type { Chunk, Page } from "./types";

/**
 * Parity between the TypeScript chunker and the Python one.
 *
 * The two pipelines index the same corpus — the CLI for bulk work, the upload
 * path for users — so they have to produce identical chunks from identical
 * pages. Unit tests on either side cannot show that; only running both over the
 * same real cache can.
 *
 * Regenerate the reference before running:
 *
 *   .venv/Scripts/python -c "import json, pathlib; \
 *     from ingest.pipeline import cache, chunk; \
 *     ..."
 *
 * Skipped when data/ is absent, which is the normal state in CI — the cache and
 * the reference are both gitignored.
 */

const ROOT = process.cwd();
const REFERENCE = join(ROOT, "data", "parity-python.json");
const CACHE = join(ROOT, "data", "cache");

function loadPages(slug: string): Page[] {
  const dir = join(CACHE, slug);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf-8")) as Page)
    .sort((a, b) => a.page - b.page);
}

const available = existsSync(REFERENCE) && existsSync(CACHE);

describe.skipIf(!available)("chunker parity with the Python pipeline", () => {
  const reference = available
    ? (JSON.parse(readFileSync(REFERENCE, "utf-8")) as Record<string, Chunk[]>)
    : {};

  for (const slug of Object.keys(reference)) {
    it(`produces identical chunks for ${slug}`, () => {
      const mine = buildChunks(loadPages(slug));
      const theirs = reference[slug];

      expect(mine).toHaveLength(theirs.length);

      mine.forEach((chunk, i) => {
        const ref = theirs[i];
        // Compared field by field so a failure names the field rather than
        // dumping two thousand characters of diff.
        expect({ i, v: chunk.page_start }).toEqual({ i, v: ref.page_start });
        expect({ i, v: chunk.page_end }).toEqual({ i, v: ref.page_end });
        expect({ i, v: chunk.lang }).toEqual({ i, v: ref.lang });
        expect({ i, v: chunk.has_formula }).toEqual({ i, v: ref.has_formula });
        expect({ i, v: chunk.has_figure }).toEqual({ i, v: ref.has_figure });
        expect({ i, v: chunk.n_tokens }).toEqual({ i, v: ref.n_tokens });
        expect({ i, v: chunk.display_text }).toEqual({ i, v: ref.display_text });
        expect({ i, v: chunk.embed_text }).toEqual({ i, v: ref.embed_text });
        expect({ i, v: chunk.figure_refs.map((f) => f.id) }).toEqual({
          i,
          v: ref.figure_refs.map((f) => f.id),
        });
      });
    });
  }
});
