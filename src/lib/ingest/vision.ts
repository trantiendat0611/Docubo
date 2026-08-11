import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generateObject } from "ai";
import { z } from "zod";
import { gemini } from "../gemini";
import type { Page, PageExtraction } from "./types";

import "server-only";

/**
 * Page images to structured content, via Gemini. Port of
 * ingest/pipeline/vision.py.
 *
 * Several pages per request, each image preceded by a label naming its page
 * number. Quota is counted in requests rather than pages, so batching is what
 * makes uploads viable at all: a 25-page document costs four requests instead
 * of twenty-five, against a per-model budget of about twenty a day.
 *
 * A batch is all-or-nothing — one page the model refuses can void the whole
 * response — so this returns whatever parsed and the caller retries the gaps.
 */

/**
 * The prompt is read from the same file the Python pipeline uses. Duplicating
 * it as a string constant here would let the two drift, and a drifting
 * extraction prompt breaks chunk parity silently — the two pipelines would
 * index the same document differently with nothing failing.
 */
const PROMPT = readFileSync(
  join(process.cwd(), "ingest", "prompts", "page_extract.md"),
  "utf-8",
);

const BATCH_INSTRUCTION =
  'You receive one or more page images. Return {"pages": [...]} with one ' +
  "object per image, in the order given. Set each object's \"page\" field to " +
  "the page number stated in the label immediately before its image. Do not " +
  "merge pages, do not skip pages, and do not reorder them.";

const langSchema = z.enum(["en", "vi", "mixed"]);

const pageSchema = z.object({
  page: z.number().int(),
  lang: langSchema,
  is_boilerplate: z.boolean(),
  markdown: z.string(),
  formulas: z.array(
    z.object({ id: z.string(), latex: z.string(), plain: z.string() }),
  ),
  figures: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["chart", "diagram", "table", "photo"]),
      caption: z.string(),
      description: z.string(),
      data: z.string(),
    }),
  ),
});

const batchSchema = z.object({ pages: z.array(pageSchema) });

/**
 * Model chain. Free tier grants requests-per-day per model, so adding models is
 * the only thing that raises daily throughput. Order by extraction quality —
 * the first entry reads the bulk of every document.
 */
export const VISION_MODELS = (
  process.env.GEMINI_VISION_MODELS ??
  "gemini-3.5-flash,gemini-2.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite"
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

/**
 * Models that have spent their daily budget. Module-scoped, so it lasts as long
 * as the warm serverless instance and no longer — the quota resets overnight,
 * and persisting it would keep a model retired after it recovered.
 */
const exhausted = new Set<string>();

/** True when the model's requests-per-DAY budget is gone, not a rate limit. */
export function isDailyQuota(error: unknown): boolean {
  return String(error).includes("GenerateRequestsPerDayPerProjectPerModel");
}

function isRecitation(error: unknown): boolean {
  return String(error).includes("RECITATION");
}

function chain(): string[] {
  // Primary twice: RECITATION is intermittent, so a second attempt at the
  // preferred model often succeeds and keeps the corpus consistent.
  return [VISION_MODELS[0], ...VISION_MODELS].filter((m) => !exhausted.has(m));
}

export interface PageImage {
  page: number;
  /** Raw image bytes, PNG unless told otherwise. */
  bytes: Uint8Array;
  mimeType?: string;
}

export class AllModelsExhausted extends Error {
  constructor() {
    super(
      "Every configured model has spent its daily request quota. Cached pages " +
        "are safe; the budget resets tomorrow. Adding models to " +
        "GEMINI_VISION_MODELS is what buys throughput.",
    );
    this.name = "AllModelsExhausted";
  }
}

/**
 * Read a batch of pages. Returns only the pages that came back cleanly, keyed
 * by page number. Never throws on a partial or refused result — only when every
 * model is out of daily quota, which the caller must surface to the user.
 */
export async function extractBatch(
  images: PageImage[],
): Promise<Map<number, Page>> {
  const found = new Map<number, Page>();
  if (images.length === 0) return found;

  const expected = images.map((i) => i.page);

  // One shape for every batch size, including one. A second schema for the
  // single-page case buys nothing and gives the two paths room to diverge.
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image"; image: Uint8Array; mimeType: string }
  > = [{ type: "text", text: PROMPT.replace("{page_instruction}", BATCH_INSTRUCTION) }];

  for (const img of images) {
    content.push({ type: "text", text: `--- PAGE ${img.page} ---` });
    // Stated rather than sniffed: the SDK can infer it, but a wrong guess
    // surfaces as an unhelpful model error rather than a decode failure.
    content.push({
      type: "image",
      image: img.bytes,
      mimeType: img.mimeType ?? "image/png",
    });
  }

  for (const model of chain()) {
    try {
      const { object } = await generateObject({
        model: gemini(model),
        schema: batchSchema,
        messages: [{ role: "user", content }],
        // Extraction, not creative writing. Zero also keeps the corpus
        // reproducible across re-runs.
        temperature: 0,
      });

      const pages = object.pages as PageExtraction[];

      pages.forEach((p, i) => {
        // Positional order is a fallback for an omitted page number, never a
        // correction for a stated one — rewriting a number the model gave would
        // file content under the wrong page, and citations point at pages.
        const page = p.page || expected[i];
        if (!expected.includes(page)) return;
        found.set(page, { ...p, page, extracted_by: model });
      });

      if (found.size > 0) return found;
    } catch (error) {
      if (isDailyQuota(error)) {
        exhausted.add(model);
        if (chain().length === 0) throw new AllModelsExhausted();
        continue;
      }
      // RECITATION and schema failures both mean "try the next model". Any
      // other error is a real fault and should reach the caller.
      if (!isRecitation(error) && !(error instanceof Error)) throw error;
    }
  }

  return found;
}

/** Which models ran out during this instance's lifetime, for reporting. */
export function exhaustedModels(): string[] {
  return [...exhausted].sort();
}
