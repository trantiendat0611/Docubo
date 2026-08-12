/**
 * Open a text stream, failing loudly if generation died before producing text.
 *
 * An HTTP response commits its status and headers the moment the body starts.
 * A generation that fails after that point can only truncate the body, so every
 * client is left to infer from an empty stream both that it failed and why —
 * and they infer differently. Pulling the first chunk here moves the common
 * failure back to a point where the caller can still return a real status code,
 * at the cost of latency the request was going to spend anyway.
 *
 * `getError` exists because `streamText` does not reject on a failed
 * generation. Its own type docs say the text stream "will throw the error";
 * measured against ai@4.3.19 it does not. A model call that throws is reported
 * to the `onError` callback and `textStream` then ends normally, first
 * `next()` resolving to `{done: true}` — which is indistinguishable from a
 * model that legitimately produced nothing. `onError` does run before that
 * first `next()` resolves, so a caller that stashes the error can hand it back
 * here and the two cases separate cleanly.
 *
 * Throws that error when the stream ends empty and one was reported. A failure
 * after the first chunk cannot be reported at all, so the stream simply ends
 * and the caller's partial-content handling takes over.
 */
export async function openTextStream(
  source: AsyncIterable<string>,
  // Required, with no default. A caller that forgets to wire this up gets a
  // route that compiles, runs, and silently returns 200 on every failed
  // generation — the exact bug this function exists to close.
  getError: () => unknown,
): Promise<ReadableStream<Uint8Array>> {
  const tokens = source[Symbol.asyncIterator]();
  const opening = await tokens.next();

  if (opening.done) {
    const error = getError();
    if (error) throw error;
  }

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
