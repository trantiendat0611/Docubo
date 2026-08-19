import { describe, expect, it } from "vitest";
import { isAborted, isDailyQuota, nextQuotaReset, withChatModel } from "./gemini";
import { GenerationTimeout } from "./stream";

describe("nextQuotaReset", () => {
  it("lands on the next midnight in Los Angeles, not the next local midnight", () => {
    // 03:22 UTC on 13 Aug is 20:22 the previous evening in Los Angeles, and
    // 10:22 the same morning in Vietnam. The budget refills at 07:00 UTC —
    // 14:00 that afternoon in Vietnam, not the following day. Telling a user in
    // Hanoi to come back "tomorrow" costs them the whole working day.
    const reset = nextQuotaReset(new Date("2026-08-13T03:22:00Z"));

    expect(reset.toISOString()).toBe("2026-08-13T07:00:00.000Z");
    expect((reset.getTime() - Date.parse("2026-08-13T03:22:00Z")) / 3_600_000).toBeCloseTo(
      3.63,
      1,
    );
  });

  it("is nearly a full day away just after a reset", () => {
    // 07:05 UTC is 00:05 in Los Angeles — five minutes into a fresh budget.
    const from = new Date("2026-08-13T07:05:00Z");
    const hours = (nextQuotaReset(from).getTime() - from.getTime()) / 3_600_000;

    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
  });

  it("follows daylight saving rather than a fixed offset", () => {
    // January is PST (UTC-8), so midnight Pacific is 08:00 UTC, an hour later
    // than the 07:00 UTC that PDT gives in August.
    expect(nextQuotaReset(new Date("2026-01-15T03:22:00Z")).toISOString()).toBe(
      "2026-01-15T08:00:00.000Z",
    );
  });
});

describe("isDailyQuota", () => {
  it("finds the quota id where the SDK buries it", () => {
    // The AI SDK truncates the message well before the interesting part; the
    // identifier survives only deeper in the object. Matching on String(error)
    // compiles, reads correctly, and never fires — which is what shipped once.
    const wrapped = {
      message: "AI_RetryError: Failed after 1 attempt",
      lastError: {
        responseBody: JSON.stringify({
          error: {
            details: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel" }],
          },
        }),
      },
    };

    expect(isDailyQuota(wrapped)).toBe(true);
    expect(String(wrapped)).not.toContain("GenerateRequestsPerDay");
  });

  it("does not treat a per-minute limit as a spent day", () => {
    // The two look alike and need opposite reactions: rotate models, or wait.
    expect(
      isDailyQuota({ lastError: { responseBody: '{"error":{"code":429}}' } }),
    ).toBe(false);
  });
});

describe("isAborted", () => {
  it("recognises the DOMException AbortSignal.timeout produces", () => {
    const controller = new AbortController();
    controller.abort(new DOMException("timed out", "TimeoutError"));
    expect(isAborted(controller.signal.reason)).toBe(true);
  });

  it("finds it once the SDK has wrapped it, which is how it arrives", () => {
    // Same reason isDailyQuota walks instead of reading: a top-level name check
    // compiles, reads correctly, and never fires.
    const wrapped = { name: "AI_RetryError", lastError: { name: "AbortError" } };
    expect(isAborted(wrapped)).toBe(true);
  });

  it("does not mistake a quota failure for a cancellation", () => {
    expect(isAborted({ name: "AI_APICallError", cause: { name: "TypeError" } })).toBe(
      false,
    );
  });
});

describe("withChatModel and a spent deadline", () => {
  it("does not spend another model on a request that has run out of time", async () => {
    // Rotation exists for quota, and the two failures want opposite handling:
    // another model has quota, but nobody has more time. A retry here would
    // guarantee the platform kills the request instead of the route answering.
    let attempts = 0;

    await expect(
      withChatModel(async () => {
        attempts += 1;
        throw new GenerationTimeout();
      }),
    ).rejects.toBeInstanceOf(GenerationTimeout);

    expect(attempts).toBe(1);
  });
});
