/**
 * Every limit in this tool lives here, once.
 *
 * Failure mode 5 (two copies of one number) is avoided structurally: nothing else
 * in the codebase is allowed to write a literal limit. If you want to change a
 * cap, you change it here and the tests that derive from it move with you.
 */
export const LIMITS = {
  /** Hard cap on a downloaded page, in bytes. Protects memory. */
  maxResponseBytes: 2_000_000,
  /** Network timeout in milliseconds. */
  fetchTimeoutMs: 10_000,
  /** Longest stored log summary, in characters. */
  maxSummaryChars: 2000,
  /** How many sentences the digest keeps. */
  summarySentences: 5,
  /** Sentences shorter than this are treated as navigation noise. */
  minSentenceChars: 30,
};

/**
 * Truncate to a cap and say so — but the marker is counted *inside* the cap.
 *
 * This is the fix for failure mode 5 in its literal form: an earlier version at a
 * different project sliced to the cap and then appended a marker, producing a
 * string longer than the cap it was written to satisfy, so every long record
 * silently failed validation and was never stored.
 */
export function truncate(text, max = LIMITS.maxSummaryChars) {
  if (text.length <= max) return text;
  const marker = '…(truncated)';
  // When the cap is smaller than the marker, a marker is not affordable: return a
  // bare slice. Appending anyway is the exact bug this function exists to avoid.
  if (max <= marker.length) return text.slice(0, max);
  const room = max - marker.length;
  return text.slice(0, room) + marker;
}
