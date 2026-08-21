import { describe, expect, it } from "vitest";
import { fitWithin } from "./image";
import { IMAGE_MAX_EDGE } from "./kinds";

describe("fitWithin", () => {
  it("leaves an image that already fits completely alone", () => {
    // Scaling a 300px diagram up to the bound makes it blurrier, not more
    // readable, and costs body budget for the privilege.
    expect(fitWithin(300, 200, 2000)).toEqual({ width: 300, height: 200 });
    expect(fitWithin(2000, 1000, 2000)).toEqual({ width: 2000, height: 1000 });
  });

  it("bounds the longest edge, whichever one it is", () => {
    expect(fitWithin(4000, 2000, 2000)).toEqual({ width: 2000, height: 1000 });
    expect(fitWithin(2000, 4000, 2000)).toEqual({ width: 1000, height: 2000 });
  });

  it("keeps the aspect ratio so text does not shear", () => {
    const { width, height } = fitWithin(3024, 4032, IMAGE_MAX_EDGE);
    expect(Math.abs(width / height - 3024 / 4032)).toBeLessThan(0.01);
    expect(Math.max(width, height)).toBe(IMAGE_MAX_EDGE);
  });

  it("never rounds a thin strip down to zero pixels", () => {
    // A wide banner screenshot: 8000x30 scaled by 0.25 rounds the height to 8,
    // but a narrower one would reach 0 and make the canvas unusable.
    const { width, height } = fitWithin(8000, 3, 2000);
    expect(width).toBe(2000);
    expect(height).toBeGreaterThanOrEqual(1);
  });

  it("handles a square at the bound exactly", () => {
    expect(fitWithin(2000, 2000, 2000)).toEqual({ width: 2000, height: 2000 });
    expect(fitWithin(2001, 2001, 2000)).toEqual({ width: 2000, height: 2000 });
  });
});
