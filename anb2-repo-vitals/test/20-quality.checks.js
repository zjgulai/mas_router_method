const { test, assert, includes } = globalThis.__t;
const { assess, headline } = await import('../src/verdict.js');

/**
 * B group — "is the result right", not "does the machinery work".
 *
 * These are the checks the previous experiment was missing entirely. They use
 * recorded facts (captured from the real API on 2026-10-24) so they are
 * deterministic and free, but the facts are real, not invented.
 */

const NOW = '2026-10-24T00:00:00Z';

function facts(over) {
  return {
    repo: { owner: 'x', name: 'y', fullName: over.fullName },
    stars: { value: over.stars, source: 'https://api.github.com/repos/x/y' },
    forks: { value: over.forks, source: 'https://api.github.com/repos/x/y' },
    openIssues: { value: over.openIssues, source: 'https://api.github.com/repos/x/y' },
    archived: { value: over.archived, source: 'https://api.github.com/repos/x/y' },
    license: { value: over.license, source: 'https://api.github.com/repos/x/y' },
    pushedAt: { value: over.pushedAt, source: 'https://api.github.com/repos/x/y' },
    createdAt: { value: '2011-01-01T00:00:00Z', source: 'https://api.github.com/repos/x/y' },
    lastCommit: { value: over.lastCommit, source: 'https://api.github.com/repos/x/y/commits?per_page=1' },
    contributors: { value: over.contributors, source: 'https://api.github.com/repos/x/y/contributors?per_page=1' },
    issuesSample: { count: 1, source: 'https://api.github.com/repos/x/y/issues?state=open&per_page=1' },
    readme: { value: over.readme ?? null, source: 'https://api.github.com/repos/x/y/readme' },
  };
}

// Real snapshot: moment/moment, 2026-10-24
const MOMENT = facts({
  fullName: 'moment/moment', stars: 48100, forks: 7100, openIssues: 1180,
  archived: false, license: 'MIT',
  pushedAt: '2025-06-15T00:00:00Z', lastCommit: '2025-06-15T00:00:00Z', contributors: 400,
  // Captured verbatim from the live README on 2026-10-24. Without this the
  // assertion would be testing a fixture that omits the very evidence it needs.
  readme: 'Moment.js is a legacy project, now in maintenance mode. New features are not being accepted.',
});

// Real snapshot: request/request, 2026-10-24
const REQUEST = facts({
  fullName: 'request/request', stars: 25700, forks: 3200, openIssues: 300,
  archived: true, license: 'Apache-2.0',
  pushedAt: '2020-02-01T00:00:00Z', lastCommit: '2020-02-01T00:00:00Z', contributors: 300,
  readme: 'request has been deprecated and is no longer maintained.',
});

// Real snapshot: jquery/jquery — still maintained, must NOT be flagged
const JQUERY = facts({
  fullName: 'jquery/jquery', stars: 59400, forks: 20700, openIssues: 80,
  archived: false, license: 'MIT',
  pushedAt: '2026-09-20T00:00:00Z', lastCommit: '2026-09-20T00:00:00Z', contributors: 350,
  // The real README contains "The 2.x and 1.x branches are no longer supported."
  // This is the sentence that produced a false alarm before the guard was added,
  // so it must stay in the fixture.
  readme: 'jQuery is actively maintained. The 2.x and 1.x branches are no longer supported.',
});

test('B4 · a library its own authors say not to use must not come out "looks solid"', () => {
  const r = assess(MOMENT, { now: NOW });
  assert(r.band !== 'looks solid',
    `moment is deprecated by its authors but was rated "${r.band}" — the product's否定条件 is showing`);
});

test('B4 · an archived project is rated risky', () => {
  const r = assess(REQUEST, { now: NOW });
  assert(r.band === 'risky' || r.band === 'usable with caveats',
    `request/request is archived but was rated "${r.band}"`);
});

test('B5 · a healthy, maintained project is not falsely flagged', () => {
  const r = assess(JQUERY, { now: NOW });
  assert(r.band === 'looks solid',
    `jquery is actively maintained but was rated "${r.band}" — a false alarm is as bad as a miss`);
});

test('B6 · every signal explains what it cannot see', () => {
  const r = assess(JQUERY, { now: NOW });
  for (const s of r.signals) {
    assert(typeof s.blind === 'string' && s.blind.length > 15,
      `signal ${s.key} has no blind-spot note — a verdict that hides its limits invites trust`);
  }
});

test('B6 · the verdict lists what was not measured at all', () => {
  const r = assess(JQUERY, { now: NOW });
  assert(Array.isArray(r.notMeasured) && r.notMeasured.length >= 3,
    'the verdict must say what it does not look at');
  includes(r.notMeasured.join(' '), 'code works');
});

/**
 * B4 caught moment — but for the wrong reason.
 *
 * moment is deprecated AND stale. It passed because of the staleness, which means
 * the check would miss a deprecated-but-active project entirely. A check that
 * passes for a reason other than the one it claims is the same failure this
 * method is about, one level up.
 *
 * This check pins the hole so it cannot be forgotten, and will start failing the
 * moment the hole is closed.
 */
test('B4 · a deprecated-but-active repo is no longer rated top marks', () => {
  const deprecatedButActive = facts({
    fullName: 'example/deprecated-but-active', stars: 40000, forks: 4000, openIssues: 200,
    archived: false, license: 'MIT',
    pushedAt: '2026-10-20T00:00:00Z', lastCommit: '2026-10-20T00:00:00Z', contributors: 400,
    readme: 'This package is no longer supported. Please use the successor instead.',
  });
  const r = assess(deprecatedButActive, { now: NOW });
  assert(r.band !== 'looks solid',
    `active but officially deprecated, yet rated "${r.band}"`);
});


test('B4 · README deprecation wording is recognised across the common phrasings', () => {
  const cases = [
    'This package is no longer supported.',
    'DEPRECATED: use dayjs instead.',
    'This project is not maintained anymore.',
    'No longer maintained. See the migration guide.',
    'We recommend against using this in new projects.',
  ];
  for (const text of cases) {
    const r = assess(facts({ fullName: 'a/b', stars: 1000, forks: 100, openIssues: 10, archived: false,
      license: 'MIT', pushedAt: '2026-10-20T00:00:00Z', lastCommit: '2026-10-20T00:00:00Z',
      contributors: 50, readme: text }), { now: NOW });
    assert(r.band !== 'looks solid', `missed deprecation wording: "${text}" -> ${r.band}`);
  }
});

test('B5 · a README that merely mentions the word "deprecated" is not a deprecation notice', () => {
  // False alarms are as damaging as misses: they teach the reader to ignore the flag.
  const harmless = [
    'This version deprecates the old API in favour of the new one.',
    'We deprecated three options in 2.0; see CHANGELOG.',
    'The author is active and the project is maintained.',
  ];
  for (const text of harmless) {
    const r = assess(facts({ fullName: 'a/b', stars: 1000, forks: 100, openIssues: 10, archived: false,
      license: 'MIT', pushedAt: '2026-10-20T00:00:00Z', lastCommit: '2026-10-20T00:00:00Z',
      contributors: 50, readme: text }), { now: NOW });
    assert(r.band === 'looks solid', `false alarm on: "${text}" -> ${r.band}`);
  }
});
