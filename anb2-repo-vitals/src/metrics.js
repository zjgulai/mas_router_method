/**
 * The three numbers, kept in memory and exposed at /metrics.
 *
 * Deliberately not a database. A single file on disk was the first instinct, but
 * two concurrent requests appending to one file interleave, and a metrics system
 * that loses writes is worse than none — you cannot tell "quiet" from "broken".
 *
 * In-memory means: correct while the process lives, reset on restart, and that
 * limitation is stated on the page rather than discovered later.
 */
export function createMetrics() {
  const startedAt = new Date().toISOString();
  let total = 0;
  let succeeded = 0;
  const failures = new Map();
  const byRepo = new Map();
  let apiCalls = 0;
  let rateLimited = 0;
  let totalMs = 0;

  return {
    requestStarted() {
      total += 1;
      return Date.now();
    },
    /**
     * Undo a count for a request that is not a product use (health check, reading
     * the dashboard itself). Without this, observing the product changes it.
     */
    requestDiscarded() {
      total -= 1;
    },
    requestFinished(startedMs, outcome) {
      const ms = Date.now() - startedMs;
      totalMs += ms;
      if (outcome.ok) {
        succeeded += 1;
        // Only a real repository is a per-repo datapoint. A success with no repo
        // produced a `null` row in the table, which reads as a bug in the data.
        if (typeof outcome.repo === 'string' && outcome.repo.length > 0) {
          byRepo.set(outcome.repo, (byRepo.get(outcome.repo) ?? 0) + 1);
        }
        apiCalls += outcome.apiCalls ?? 0;
      } else {
        // Grouped by reason, not by message: a message contains a URL, and forty
        // rows of one cause is how a failure table becomes unreadable.
        const key = outcome.reason;
        failures.set(key, (failures.get(key) ?? 0) + 1);
        if (outcome.rateLimited) rateLimited += 1;
        apiCalls += outcome.apiCalls ?? 0;
      }
    },
    snapshot() {
      const now = new Date().toISOString();
      return {
        startedAt,
        uptimeSec: Math.round((Date.parse(now) - Date.parse(startedAt)) / 1000),
        requests: { total, succeeded, failed: total - succeeded },
        failureReasons: [...failures.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([reason, count]) => ({ reason, count })),
        distinctRepos: byRepo.size,
        topRepos: [...byRepo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
          .map(([repo, count]) => ({ repo, count })),
        // The thing this product actually spends. Token cost would be zero and
        // therefore useless; quota is what runs out.
        api: { calls: apiCalls, rateLimited },
        avgMs: total > 0 ? Math.round(totalMs / total) : 0,
      };
    },
  };
}
