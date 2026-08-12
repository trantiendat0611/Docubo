import { describe, expect, it } from "vitest";
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

async function* from(chunks: string[]): AsyncGenerator<string> {
  for (const chunk of chunks) yield chunk;
}

describe("openTextStream", () => {
  it("keeps the first chunk, which is the one already consumed", async () => {
    const stream = await openTextStream(from(["Xin ", "chào ", "bạn"]));
    expect(await collect(stream)).toBe("Xin chào bạn");
  });

  it("throws when the first chunk fails, so the caller can still set a status", async () => {
    async function* fails(): AsyncGenerator<string> {
      throw new Error("429 RESOURCE_EXHAUSTED");
    }

    // The point of the whole design: this rejects instead of resolving to an
    // empty stream, which is what let a failed generation look like a 200.
    await expect(openTextStream(fails())).rejects.toThrow("RESOURCE_EXHAUSTED");
  });

  it("ends cleanly when generation dies partway, keeping what arrived", async () => {
    async function* diesLate(): AsyncGenerator<string> {
      yield "Câu trả lời bắt đầu";
      throw new Error("stream died");
    }

    // Past the first chunk the status is already sent, so the partial answer is
    // all there is to give. It must not reject or hang.
    const stream = await openTextStream(diesLate());
    expect(await collect(stream)).toBe("Câu trả lời bắt đầu");
  });

  it("handles a source that yields nothing", async () => {
    const stream = await openTextStream(from([]));
    expect(await collect(stream)).toBe("");
  });
});
