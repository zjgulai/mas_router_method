const { test, assert, equal, includes } = globalThis.__t;
const { parseRepo, countFromLink } = await import('../src/github.js');
const { assess, headline } = await import('../src/verdict.js');

// ---------- A1: every number carries a source ----------
test('A1 · every signal carries a source URL', () => {
  const facts = mkFacts();
  const r = assess(facts, { now: NOW });
  for (const s of r.signals) {
    assert(typeof s.source === 'string' && s.source.startsWith('http'),
      `signal ${s.key} has no source url: ${JSON.stringify(s.source)}`);
  }
});

// ---------- A2: failure means no verdict ----------
test('A2 · an unknown level is reported as unknown, never scored as good', () => {
  const facts = mkFacts({ contributors: null });
  const r = assess(facts, { now: NOW });
  const bus = r.signals.find((s) => s.key === 'bus-factor');
  equal(bus.level, 'unknown', 'missing contributor count must not become "good"');
});

test('A2 · an unobtainable signal lowers certainty rather than silently passing', () => {
  const full = assess(mkFacts(), { now: NOW });
  const partial = assess(mkFacts({ contributors: null }), { now: NOW });
  // Both can score the same, but the partial one must be visibly less certain.
  const unknownCount = partial.signals.filter((s) => s.level === 'unknown').length;
  assert(unknownCount > 0, 'a missing signal must appear as unknown');
  assert(full.signals.filter((s) => s.level === 'unknown').length < unknownCount,
    'the complete case should have fewer unknowns than the partial one');
});

// ---------- A3: numbers in the headline exist in the table ----------
test('A3 · the headline names only signals that are actually in the table', () => {
  const r = assess(mkFacts({ idleDays: 900, archived: true }), { now: NOW });
  const text = headline(r);
  const labels = r.signals.map((s) => s.label);
  const mentioned = labels.filter((l) => text.includes(l));
  for (const m of mentioned) {
    assert(r.signals.some((s) => s.label === m && s.level === 'bad'),
      `headline mentions "${m}" but it is not a bad signal`);
  }
});

test('A3 · a verdict with no bad signals says so explicitly', () => {
  const r = assess(mkFacts(), { now: NOW });
  includes(headline(r), 'No red flags');
});

// ---------- A7: determinism ----------
test('A7 · the same facts produce the same verdict twice', () => {
  const a = assess(mkFacts(), { now: NOW });
  const b = assess(mkFacts(), { now: NOW });
  equal(a, b, 'assess() must be a pure function of its input');
});

// ---------- parser ----------
test('parseRepo accepts the four forms a user will paste', () => {
  equal(parseRepo('nodejs/node'), { owner: 'nodejs', name: 'node' });
  equal(parseRepo('https://github.com/nodejs/node'), { owner: 'nodejs', name: 'node' });
  equal(parseRepo('https://github.com/nodejs/node.git'), { owner: 'nodejs', name: 'node' });
  equal(parseRepo('https://github.com/nodejs/node/issues/42'), { owner: 'nodejs', name: 'node' });
});

test('parseRepo returns null rather than guessing on bad input', () => {
  equal(parseRepo('nonsense'), null);
  equal(parseRepo('a/b/c'), null);
  equal(parseRepo(''), null);
});

test('countFromLink reads the last page number, and admits when it cannot', () => {
  const withLink = { data: [{}], headers: new Map([['link', '<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=4531>; rel="last"']]) };
  const headerShim = { get: (k) => withLink.headers.get(k) ?? null };
  equal(countFromLink({ data: withLink.data, headers: headerShim }), 4531);
  equal(countFromLink({ data: [{}, {}], headers: { get: () => null } }), 2);
  equal(countFromLink({ data: null, headers: { get: () => null } }), null);
});

// ---------- helpers ----------
const NOW = '2026-10-24T00:00:00Z';
function mkFacts(o = {}) {
  const idleDays = o.idleDays ?? 5;
  const lastCommitIso = new Date(Date.parse(NOW) - idleDays * 86400000).toISOString();
  return {
    repo: { owner: 'a', name: 'b', fullName: 'a/b' },
    stars: { value: 5000, source: 'https://api.github.com/repos/a/b' },
    forks: { value: 100, source: 'https://api.github.com/repos/a/b' },
    openIssues: { value: 50, source: 'https://api.github.com/repos/a/b' },
    archived: { value: o.archived ?? false, source: 'https://api.github.com/repos/a/b' },
    license: { value: 'MIT', source: 'https://api.github.com/repos/a/b' },
    pushedAt: { value: lastCommitIso, source: 'https://api.github.com/repos/a/b' },
    createdAt: { value: '2019-01-01T00:00:00Z', source: 'https://api.github.com/repos/a/b' },
    lastCommit: { value: lastCommitIso, source: 'https://api.github.com/repos/a/b/commits?per_page=1' },
    contributors: { value: o.contributors === undefined ? 25 : o.contributors, source: 'https://api.github.com/repos/a/b/contributors?per_page=1' },
    issuesSample: { count: 1, source: 'https://api.github.com/repos/a/b/issues?state=open&per_page=1' },
  };
}
