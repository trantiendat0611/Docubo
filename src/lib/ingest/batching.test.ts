import { describe, expect, it } from "vitest";
import { shouldFlushBefore } from "./batching";

const limits = { maxBytes: 3_000_000, maxPages: 8 };

describe("upload batching", () => {
  it("never flushes an empty batch", () => {
    // A single page bigger than the entire budget must still be sent, not
    // dropped into an infinite flush loop.
    expect(shouldFlushBefore({ count: 0, bytes: 0 }, 9_000_000, limits)).toBe(false);
  });

  it("keeps accumulating while both ceilings have room", () => {
    expect(shouldFlushBefore({ count: 3, bytes: 900_000 }, 400_000, limits)).toBe(false);
  });

  it("flushes when the next page would exceed the byte budget", () => {
    // Four heavy pages, not eight: the whole point of measuring bytes.
    expect(shouldFlushBefore({ count: 4, bytes: 2_800_000 }, 400_000, limits)).toBe(true);
  });

  it("flushes at the page ceiling even when the pages are small", () => {
    // Eight tiny pages still cost eight pages of the daily request budget's
    // worth of context; the batch size is what keeps quota predictable.
    expect(shouldFlushBefore({ count: 8, bytes: 100_000 }, 10_000, limits)).toBe(true);
  });

  it("does not flush exactly at the byte budget", () => {
    expect(shouldFlushBefore({ count: 2, bytes: 2_000_000 }, 1_000_000, limits)).toBe(false);
    expect(shouldFlushBefore({ count: 2, bytes: 2_000_001 }, 1_000_000, limits)).toBe(true);
  });

  it("packs a realistic mix into deliverable requests", () => {
    // Measured page sizes: mostly ~480KB with occasional 2MB pages.
    const sizes = [480, 480, 2039, 480, 480, 480, 2039, 480, 480, 480].map((kb) => kb * 1024);

    const requests: number[][] = [];
    let batch: number[] = [];
    let bytes = 0;

    for (const size of sizes) {
      if (shouldFlushBefore({ count: batch.length, bytes }, size, limits)) {
        requests.push(batch);
        batch = [];
        bytes = 0;
      }
      batch.push(size);
      bytes += size;
    }
    if (batch.length) requests.push(batch);

    for (const request of requests) {
      const total = request.reduce((a, b) => a + b, 0);
      expect(total).toBeLessThanOrEqual(limits.maxBytes);
      expect(request.length).toBeLessThanOrEqual(limits.maxPages);
    }
    // All ten pages accounted for, none lost at a boundary.
    expect(requests.flat()).toHaveLength(sizes.length);
  });
});
