import { UPLOAD_BYTES_PER_REQUEST, VISION_BATCH_SIZE } from "./config";

/**
 * When to send the pages accumulated so far.
 *
 * Two ceilings, and the byte one is the reason this exists. Page images at 200
 * dpi average 480KB but reach 2MB on dense pages, so a fixed batch of eight
 * fits on average and bursts past the 4.5MB body limit whenever several heavy
 * pages land together. Deciding per page instead sends eight light pages or
 * three heavy ones and never a request that cannot be delivered.
 *
 * Pure, and separate from the component, because it is the one piece of the
 * upload loop worth asserting on — the rest is fetch calls and progress state.
 */
export function shouldFlushBefore(
  batch: { count: number; bytes: number },
  nextBytes: number,
  limits = {
    maxBytes: UPLOAD_BYTES_PER_REQUEST,
    maxPages: VISION_BATCH_SIZE,
  },
): boolean {
  // Never flush an empty batch: a single page larger than the whole budget
  // still has to be sent on its own rather than dropped.
  if (batch.count === 0) return false;

  return (
    batch.bytes + nextBytes > limits.maxBytes || batch.count >= limits.maxPages
  );
}
