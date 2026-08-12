/**
 * Open a text stream by pulling its first chunk before anything is committed.
 *
 * An HTTP response commits its status and headers the moment the body starts.
 * A generation that fails after that point can only truncate the body, so every
 * client is left to infer from an empty stream both that it failed and why —
 * and they infer differently. Pulling the first chunk here moves the common
 * failure back to a point where the caller can still return a real status code,
 * at the cost of latency the request was going to spend anyway.
 *
 * Throws whatever the source threw when the failure happens on that first
 * chunk. A failure after it cannot be reported, so the stream simply ends and
 * the caller's partial-content handling takes over.
 */
export async function openTextStream(
  source: AsyncIterable<string>,
): Promise<ReadableStream<Uint8Array>> {
  const tokens = source[Symbol.asyncIterator]();
  const opening = await tokens.next();
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // The first chunk is already consumed; re-emitting it here is what
        // keeps the answer from losing its opening word.
        if (!opening.done) controller.enqueue(encoder.encode(opening.value));
        for (;;) {
          const next = await tokens.next();
          if (next.done) break;
          controller.enqueue(encoder.encode(next.value));
        }
      } catch {
        // Nothing can change the status now. End cleanly and let whatever
        // arrived stand, rather than surfacing an error the client cannot act on.
      }
      controller.close();
    },
  });
}
