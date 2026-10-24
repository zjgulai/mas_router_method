const { test, assert, equal } = globalThis.__t;
const { createMetrics } = await import('../src/metrics.js');
const { server, resetMetrics } = await import('../src/server.js');

/**
 * The metric that matters is the count, and the count has to add up.
 *
 * A dashboard where failures do not sum to the total is worse than no dashboard:
 * it looks precise and hides the difference. The first version of this had exactly
 * that bug — every page that was not a repository lookup incremented the total and
 * never recorded an outcome.
 */

test('the three counters always reconcile', () => {
  const m = createMetrics();
  m.requestFinished(m.requestStarted(), { ok: true, repo: 'a/b', apiCalls: 4, reason: null });
  m.requestFinished(m.requestStarted(), { ok: false, repo: null, apiCalls: 1, reason: 'github rate limit', rateLimited: true });
  m.requestFinished(m.requestStarted(), { ok: false, repo: null, apiCalls: 0, reason: 'invalid repo input' });

  const s = m.snapshot();
  const byReason = s.failureReasons.reduce((sum, f) => sum + f.count, 0);
  equal(s.requests.total, 3);
  equal(s.requests.succeeded + byReason, s.requests.total,
    'every request must end as either a success or a named failure');
});

test('failures group by reason, not by message', () => {
  const m = createMetrics();
  for (let i = 0; i < 5; i += 1) {
    m.requestFinished(m.requestStarted(), { ok: false, repo: null, apiCalls: 1, reason: 'github rate limit' });
  }
  const s = m.snapshot();
  equal(s.failureReasons.length, 1, 'five identical causes must produce one row');
  equal(s.failureReasons[0].count, 5);
});

test('quota is counted, because quota is what this product spends', () => {
  const m = createMetrics();
  m.requestFinished(m.requestStarted(), { ok: true, repo: 'a/b', apiCalls: 4, reason: null });
  m.requestFinished(m.requestStarted(), { ok: false, repo: null, apiCalls: 1, reason: 'x', rateLimited: true });
  const s = m.snapshot();
  equal(s.api.calls, 5);
  equal(s.api.rateLimited, 1);
});

test('every HTTP exit closes its record — no path may increment without resolving', async () => {
  resetMetrics(); // start from zero; counts must reflect this test only
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fetch(base + '/');                       // search page — not counted
    await fetch(base + '/?repo=nonsense');         // invalid input — counted, named
    await fetch(base + '/nowhere');                // 404 — counted, named
    const s = await (await fetch(base + '/metrics')).json();
    const byReason = s.failureReasons.reduce((sum, f) => sum + f.count, 0);
    equal(s.requests.succeeded + byReason, s.requests.total,
      `reconciled ${s.requests.succeeded} ok + ${byReason} named failures vs ${s.requests.total} total`);
    // Two user attempts reach the product: the invalid one and the 404.
    equal(s.requests.total, 2, 'only requests that reach the product are counted');
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('a blank query is not counted as a successful lookup', async () => {
  resetMetrics();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fetch(base + '/');            // front page, no repo param
    await fetch(base + '/?repo=%20');   // whitespace-only, also the front page
    const s = await (await fetch(base + '/metrics')).json();
    equal(s.requests.total, 0, 'landing on the front page is not a lookup');
    equal(s.topRepos.length, 0, 'no repository was looked up');
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('a success never produces a null row in the per-repo table', () => {
  const m = createMetrics();
  m.requestFinished(m.requestStarted(), { ok: true, repo: null, apiCalls: 0, reason: null });
  const s = m.snapshot();
  equal(s.topRepos.length, 0, 'a null repo must not appear as a datapoint');
});
