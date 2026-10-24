const { test, assert, equal, includes, throwsAsync } = globalThis.__t;
const { fetchRepoFacts } = await import('../src/github.js');
const { assess, headline } = await import('../src/verdict.js');

/**
 * Degradation: which failures must stop the verdict, and which must only appear
 * as gaps. Getting this wrong in either direction is a real product failure:
 * too strict and a rate-limited optional endpoint destroys a valid verdict;
 * too lax and a verdict is issued without the evidence it claims to rest on.
 */

const NOW = '2026-10-24T00:00:00Z';

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}
const rateLimited = () => json({ message: 'API rate limit exceeded' }, { status: 403, headers: { 'x-ratelimit-remaining': '0' } });
const repoBody = { full_name: 'a/b', stargazers_count: 100, forks_count: 10, open_issues_count: 5, archived: false, license: { spdx_id: 'MIT' }, pushed_at: '2026-10-20T00:00:00Z', created_at: '2020-01-01T00:00:00Z' };
const commitBody = [{ commit: { author: { date: '2026-10-20T00:00:00Z' } } }];
const readmeBody = { content: Buffer.from('A healthy library.').toString('base64'), encoding: 'base64' };

function fakeFetch(routes) {
  return async (url) => {
    for (const [pattern, handler] of routes) {
      if (url.includes(pattern)) return handler();
    }
    return json({}, { status: 404 });
  };
}

test('a rate-limited optional endpoint becomes a gap, not a failure', async () => {
  const facts = await fetchRepoFacts({ owner: 'a', name: 'b' }, {
    fetchImpl: fakeFetch([
      ['/contributors', rateLimited],
      ['/commits', () => json(commitBody)],
      ['/issues', () => json([{ id: 1 }])],
      ['/readme', () => json(readmeBody)],
      ['/a/b', () => json(repoBody)],
    ]),
  });
  const r = assess(facts, { now: NOW });
  const bus = r.signals.find((s) => s.key === 'bus-factor');
  equal(bus.level, 'unknown', 'contributors unavailable must be unknown, not bad');
  assert(r.score > 0, 'a verdict should still be produced');
  assert(facts.gaps.length === 1, `expected one gap, got ${facts.gaps.length}`);
  includes(facts.gaps[0], 'rate limit');
});

test('the verdict names the gap rather than hiding it', async () => {
  const facts = await fetchRepoFacts({ owner: 'a', name: 'b' }, {
    fetchImpl: fakeFetch([
      ['/contributors', rateLimited],
      ['/commits', () => json(commitBody)],
      ['/issues', () => json([{ id: 1 }])],
      ['/readme', () => json(readmeBody)],
      ['/a/b', () => json(repoBody)],
    ]),
  });
  const r = assess(facts, { now: NOW });
  const unknown = r.signals.filter((s) => s.level === 'unknown').map((s) => s.label);
  assert(unknown.length === 1 && unknown[0] === 'bus factor',
    `the unknown signal must be visible: got ${JSON.stringify(unknown)}`);
  assert(!headline(r).includes('No red flags') || r.signals.some((s) => s.level !== 'good'),
    'a headline claiming "no red flags" while a signal is unknown needs to be justified');
});

test('a rate-limited repository endpoint stops the assessment with a named reason', async () => {
  const message = await throwsAsync(
    () => fetchRepoFacts({ owner: 'a', name: 'b' }, {
      fetchImpl: fakeFetch([['/a/b', rateLimited]]),
    }),
    'rate limit',
  );
  includes(message, 'api.github.com/repos/a/b');
});

test('a rate-limited commits endpoint also stops it — activity is not optional', async () => {
  await throwsAsync(
    () => fetchRepoFacts({ owner: 'a', name: 'b' }, {
      fetchImpl: fakeFetch([
        ['/commits', rateLimited],
        ['/a/b', () => json(repoBody)],
      ]),
    }),
    'rate limit',
  );
});

test('a missing readme is a gap, not an error', async () => {
  const facts = await fetchRepoFacts({ owner: 'a', name: 'b' }, {
    fetchImpl: fakeFetch([
      ['/readme', () => json({ message: 'Not Found' }, { status: 404 })],
      ['/commits', () => json(commitBody)],
      ['/issues', () => json([{ id: 1 }])],
      ['/contributors', () => json([{}], { headers: { link: '' } })],
      ['/a/b', () => json(repoBody)],
    ]),
  });
  const r = assess(facts, { now: NOW });
  const notice = r.signals.find((s) => s.key === 'deprecation');
  equal(notice.level, 'unknown', 'no readme means the author notice is unknown');
  includes(notice.value, 'unknown');
});
