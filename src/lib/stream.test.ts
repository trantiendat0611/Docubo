import { streamText } from "ai";
import { MockLanguageModelV1, convertArrayToReadableStream } from "ai/test";
import { describe, expect, it } from "vitest";
import { NO_SDK_RETRIES } from "./gemini";
import { GenerationTimeout, openTextStream } from "./stream";

async function collect(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

/** No failure was reported. */
const noError = () => undefined;

/** Long enough that the deadline plays no part in these cases. */
const AMPLE = 10_000;

async function* from(chunks: string[]): AsyncGenerator<string> {
  for (const chunk of chunks) yield chunk;
}

describe("openTextStream", () => {
  it("keeps the first chunk, which is the one already consumed", async () => {
    const stream = await openTextStream(from(["Xin ", "chào ", "bạn"]), noError, AMPLE);
    expect(await collect(stream)).toBe("Xin chào bạn");
  });

  it("throws when the first chunk fails, so the caller can still set a status", async () => {
    async function* fails(): AsyncGenerator<string> {
      throw new Error("429 RESOURCE_EXHAUSTED");
    }

    // The point of the whole design: this rejects instead of resolving to an
    // empty stream, which is what let a failed generation look like a 200.
    await expect(openTextStream(fails(), noError, AMPLE)).rejects.toThrow("RESOURCE_EXHAUSTED");
  });

  it("ends cleanly when generation dies partway, keeping what arrived", async () => {
    async function* diesLate(): AsyncGenerator<string> {
      yield "Câu trả lời bắt đầu";
      throw new Error("stream died");
    }

    // Past the first chunk the status is already sent, so the partial answer is
    // all there is to give. It must not reject or hang.
    const stream = await openTextStream(diesLate(), noError, AMPLE);
    expect(await collect(stream)).toBe("Câu trả lời bắt đầu");
  });

  it("handles a source that yields nothing", async () => {
    const stream = await openTextStream(from([]), noError, AMPLE);
    expect(await collect(stream)).toBe("");
  });

  // The tests above drive hand-written generators, which prove the relay logic
  // but say nothing about how the SDK actually reports a failure. The first
  // version of this file assumed textStream throws — the SDK's own type docs
  // say so — and the assumption was wrong, which would have shipped a 503 path
  // that never fires. These two drive the real streamText.
  it("surfaces a streamText failure, which arrives via onError and not by throwing", async () => {
    let generationError: unknown;

    const result = streamText({
      model: new MockLanguageModelV1({
        doStream: async () => {
          throw new Error("429 RESOURCE_EXHAUSTED: quota exceeded");
        },
      }),
      prompt: "câu hỏi bất kì",
      ...NO_SDK_RETRIES,
      onError: ({ error }) => {
        generationError = error;
      },
    });

    await expect(
      openTextStream(result.textStream, () => generationError, AMPLE),
    ).rejects.toThrow("RESOURCE_EXHAUSTED");
  });

  it("without the reported error, the same failure looks like an empty answer", async () => {
    const result = streamText({
      model: new MockLanguageModelV1({
        doStream: async () => {
          throw new Error("429 RESOURCE_EXHAUSTED: quota exceeded");
        },
      }),
      prompt: "câu hỏi bất kì",
      ...NO_SDK_RETRIES,
      onError: () => {},
    });

    // This is the bug being fixed, pinned as a test: the stream ends normally
    // and carries no text, so a route without the onError capture answers 200
    // with an empty body and no way to say why.
    const stream = await openTextStream(result.textStream, noError, AMPLE);
    expect(await collect(stream)).toBe("");
  });

  it("relays a real streamText response without losing the first delta", async () => {
    const result = streamText({
      model: new MockLanguageModelV1({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            { type: "text-delta", textDelta: "Theo tài liệu" },
            { type: "text-delta", textDelta: ", câu trả lời là [1]." },
            {
              type: "finish",
              finishReason: "stop",
              usage: { promptTokens: 10, completionTokens: 20 },
            },
          ]),
          rawCall: { rawPrompt: null, rawSettings: {} },
        }),
      }),
      prompt: "câu hỏi bất kì",
      ...NO_SDK_RETRIES,
    });

    const stream = await openTextStream(result.textStream, noError, AMPLE);
    expect(await collect(stream)).toBe("Theo tài liệu, câu trả lời là [1].");
  });

  // The deadline. These matter more than the ones above: the failure they
  // describe is the one that actually reached production, and the first attempt
  // at fixing it did not work.
  it("gives up on a source that never produces a first token", async () => {
    // A generator that never yields and never returns — the shape of a model
    // call that hangs. Before the deadline existed this awaited forever, and
    // the only thing that ended it was the platform killing the function at
    // sixty seconds, by which point no status could be sent.
    async function* neverStarts(): AsyncGenerator<string> {
      await new Promise(() => {});
      yield "không bao giờ tới đây";
    }

    await expect(openTextStream(neverStarts(), noError, 50)).rejects.toBeInstanceOf(
      GenerationTimeout,
    );
  });

  it("passing abortSignal to streamText is not enough on its own", async () => {
    // Measured, not assumed. streamText accepts an abortSignal, and the natural
    // reading is that it ends the call — but the signal only reaches whatever
    // is underneath, and a provider that ignores it leaves the await hanging
    // exactly as before. This drives a model that never resolves, with a signal
    // that fires almost immediately, and the deadline inside openTextStream is
    // the only thing that ends the test.
    let generationError: unknown;

    const result = streamText({
      model: new MockLanguageModelV1({ doStream: () => new Promise(() => {}) }),
      prompt: "câu hỏi bất kì",
      abortSignal: AbortSignal.timeout(20),
      ...NO_SDK_RETRIES,
      onError: ({ error }) => {
        generationError = error;
      },
    });

    await expect(
      openTextStream(result.textStream, () => generationError, 80),
    ).rejects.toBeInstanceOf(GenerationTimeout);
  });

  it("does not fire once a first token has arrived", async () => {
    // Past the opening chunk the status is already sent and the user is reading
    // the answer. Cutting it off there would trade a slow answer for no answer.
    async function* slowAfterFirst(): AsyncGenerator<string> {
      yield "Bắt đầu";
      await new Promise((r) => setTimeout(r, 30));
      yield " rồi tiếp tục";
    }

    const stream = await openTextStream(slowAfterFirst(), noError, 60);
    expect(await collect(stream)).toBe("Bắt đầu rồi tiếp tục");
  });

  it("lets the source clean up instead of leaving it running", async () => {
    let released = false;

    const source: AsyncIterable<string> = {
      [Symbol.asyncIterator]: () => ({
        next: () => new Promise<IteratorResult<string>>(() => {}),
        return: async () => {
          released = true;
          return { done: true as const, value: undefined };
        },
      }),
    };

    await expect(openTextStream(source, noError, 30)).rejects.toBeInstanceOf(
      GenerationTimeout,
    );
    expect(released).toBe(true);
  });

  it("treats a deadline already spent as no time at all", async () => {
    // The budget is for the whole request, so by the time generation starts it
    // can already be gone. It must fail immediately rather than wait.
    async function* neverStarts(): AsyncGenerator<string> {
      await new Promise(() => {});
      yield "";
    }

    const started = Date.now();
    await expect(openTextStream(neverStarts(), noError, -1)).rejects.toBeInstanceOf(
      GenerationTimeout,
    );
    expect(Date.now() - started).toBeLessThan(200);
  });
});
