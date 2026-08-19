/**
 * How long a request may take before the platform kills it.
 *
 * /api/chat declares maxDuration = 60 and the response still has to travel, so
 * generation works to a deadline under that rather than to the ceiling itself.
 * Two questions in the 19/08 eval run came back at 62.4s and 62.6s: Vercel had
 * killed the function mid-await, and because no headers had been sent the
 * client received a platform error page rather than anything the route could
 * shape.
 *
 * A budget for the whole request, not a duration for the model call — the
 * guardrail, the embedding, the search and the history read all happen first,
 * and "45 seconds to generate" still blows the ceiling if they took twenty.
 */
export const REQUEST_BUDGET_MS = 50_000;

/** The request ran out of time before an answer started arriving. */
export class GenerationTimeout extends Error {
  constructor() {
    super("generation did not produce a first token within the request budget");
    this.name = "GenerationTimeout";
  }
}

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
  // Also required, and for the same reason. The await below is where a slow
  // model turns into a dead request: two questions in the 19/08 eval run sat
  // here until the platform killed the function at sixty seconds, and the
  // client got an error page it could not read.
  //
  // Passing an abortSignal to streamText is not enough on its own. Measured
  // against a model that never resolves, the abort never arrives here at all —
  // the signal only helps when whatever is underneath chooses to honour it.
  // The deadline has to sit where the waiting actually happens.
  timeoutMs: number,
): Promise<ReadableStream<Uint8Array>> {
  const tokens = source[Symbol.asyncIterator]();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = Symbol("expired");
  const deadline = new Promise<typeof expired>((resolve) => {
    timer = setTimeout(() => resolve(expired), Math.max(timeoutMs, 0));
  });

  let opening: IteratorResult<string>;
  try {
    const first = await Promise.race([tokens.next(), deadline]);
    if (first === expired) {
      // Let the source clean up rather than leaving it generating into a
      // request nobody will read.
      void tokens.return?.(undefined);
      throw new GenerationTimeout();
    }
    opening = first;
  } finally {
    clearTimeout(timer);
  }

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
