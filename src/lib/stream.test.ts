import { streamText } from "ai";
import { MockLanguageModelV1, convertArrayToReadableStream } from "ai/test";
import { describe, expect, it } from "vitest";
import { NO_SDK_RETRIES } from "./gemini";
import { openTextStream } from "./stream";

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

async function* from(chunks: string[]): AsyncGenerator<string> {
  for (const chunk of chunks) yield chunk;
}

describe("openTextStream", () => {
  it("keeps the first chunk, which is the one already consumed", async () => {
    const stream = await openTextStream(from(["Xin ", "chào ", "bạn"]), noError);
    expect(await collect(stream)).toBe("Xin chào bạn");
  });

  it("throws when the first chunk fails, so the caller can still set a status", async () => {
    async function* fails(): AsyncGenerator<string> {
      throw new Error("429 RESOURCE_EXHAUSTED");
    }

    // The point of the whole design: this rejects instead of resolving to an
    // empty stream, which is what let a failed generation look like a 200.
    await expect(openTextStream(fails(), noError)).rejects.toThrow("RESOURCE_EXHAUSTED");
  });

  it("ends cleanly when generation dies partway, keeping what arrived", async () => {
    async function* diesLate(): AsyncGenerator<string> {
      yield "Câu trả lời bắt đầu";
      throw new Error("stream died");
    }

    // Past the first chunk the status is already sent, so the partial answer is
    // all there is to give. It must not reject or hang.
    const stream = await openTextStream(diesLate(), noError);
    expect(await collect(stream)).toBe("Câu trả lời bắt đầu");
  });

  it("handles a source that yields nothing", async () => {
    const stream = await openTextStream(from([]), noError);
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
      openTextStream(result.textStream, () => generationError),
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
    const stream = await openTextStream(result.textStream, noError);
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

    const stream = await openTextStream(result.textStream, noError);
    expect(await collect(stream)).toBe("Theo tài liệu, câu trả lời là [1].");
  });
});
