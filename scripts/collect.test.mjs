#!/usr/bin/env node
/**
 * Tests for the collect ledger.
 *
 * The invariants under test are the ones whose failure is invisible:
 *
 *   · `first_seen_at` does not move on re-fetch. If it moves, every weekly series
 *     silently becomes "how old is my last scrape" instead of "how much volume".
 *   · an empty run is recorded. If it is not, an outage and a quiet week are the
 *     same rows in the file, and they demand opposite responses.
 *   · a migration keeps old records readable. "Old data is still queryable" is the
 *     line every migration ADR promises and almost none checks.
 *
 * Everything here runs against a temp file; nothing touches work/.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ingest, view, verify, readLedger, checkObservation } from './collect-store.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (args) => promisify(execFile)(process.execPath, [join(ROOT, 'scripts/collect-store.mjs'), ...args])
  .then((r) => ({ code: 0, out: r.stdout }))
  .catch((e) => ({ code: e.code ?? 1, out: (e.stdout ?? '') + (e.stderr ?? '') }));

const obs = (over = {}) => ({
  source: 'tiktok',
  fingerprint: 'fp-1',
  first_seen_at: '2026-10-01T00:00:00Z',
  fetched_at: '2026-10-01T00:00:00Z',
  source_task_id: 'task-a',
  schema_version: 1,
  taxonomy_version: 1,
  metric_version: 1,
  region: 'US',
  region_basis: 'hashtag:v1',
  raw: { likes: 10 },
  ...over,
});

const batch = (over = {}) => ({
  run: {
    source: 'tiktok', run_id: 'r1', source_task_id: 'task-a',
    fetched_at: '2026-10-01T00:00:00Z', status: 'ok', items: 1,
    ...(over.run ?? {}),
  },
  observations: over.observations ?? [obs()],
});

/** A temp ledger directory; the caller removes it. */
async function tmp() {
  const dir = await mkdtemp(join(tmpdir(), 'collect-'));
  return { dir, ledger: join(dir, 'ledger.jsonl') };
}

test('first_seen_at is the minimum across fetches, so a later scrape cannot age an item forward', async () => {
  const { dir, ledger } = await tmp();
  try {
    await ingest(ledger, batch());
    // Same item, a week later, far more likes — the ordinary shape of a re-scrape.
    await ingest(ledger, batch({
      run: { run_id: 'r2', source_task_id: 'task-b', fetched_at: '2026-10-08T00:00:00Z' },
      observations: [obs({ first_seen_at: '2026-10-08T00:00:00Z', fetched_at: '2026-10-08T00:00:00Z', raw: { likes: 99 } })],
    }));
    const { observations, migrations } = await readLedger(ledger);
    const [row] = view(observations, migrations);
    assert.equal(row.first_seen_at, '2026-10-01T00:00:00Z',
      'first_seen_at must stay at the earliest sighting — anchoring to the latest fetch turns "scraped later" into "more popular"');
    assert.equal(row.last_fetched_at, '2026-10-08T00:00:00Z');
    assert.equal(row.raw.likes, 99, 'the reported payload is the latest, only the anchor is the earliest');
    assert.equal(row.observations, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('re-ingesting the same run is a no-op, not a duplicate and not an error', async () => {
  const { dir, ledger } = await tmp();
  try {
    const first = await ingest(ledger, batch());
    const second = await ingest(ledger, batch());
    assert.equal(first.appended, 1);
    assert.equal(second.appended, 0);
    assert.match(second.skipped, /already recorded/);
    const { observations } = await readLedger(ledger);
    assert.equal(observations.length, 1, 'a re-run must not double-count the source');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the same run_id with different content is rejected — two payloads cannot claim one fetch', async () => {
  const { dir, ledger } = await tmp();
  try {
    await ingest(ledger, batch());
    await assert.rejects(
      () => ingest(ledger, batch({ run: { items: 5 } })),
      /already ingested with different content/,
    );
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('an empty run is recorded, because a miss and a quiet week must not look alike', async () => {
  const { dir, ledger } = await tmp();
  try {
    await ingest(ledger, batch({
      run: { run_id: 'r-empty', status: 'ok', items: 0, fetched_at: '2026-10-02T00:00:00Z' },
      observations: [],
    }));
    const { runs, observations } = await readLedger(ledger);
    assert.equal(observations.length, 0);
    assert.equal(runs.length, 1, 'the run must exist even though it carried nothing');
    assert.equal(runs[0].status, 'ok');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('an observation without version fields is refused', () => {
  const { schema_version: _drop, ...noSchema } = obs();
  assert.throws(() => checkObservation(noSchema), /schema_version/);
  assert.throws(() => checkObservation({ ...obs(), taxonomy_version: undefined }), /taxonomy_version/);
});

test('the original payload cannot be dropped', () => {
  const { raw: _drop, ...noRaw } = obs();
  assert.throws(() => checkObservation(noRaw), /raw/);
});

test('a region outside the four-value namespace is refused, because it would be counted as one', () => {
  assert.throws(() => checkObservation(obs({ region: 'USA' })), /neither an ISO alpha-2/);
  assert.throws(() => checkObservation(obs({ region: 'unknown' })), /neither an ISO alpha-2/,
    '"unknown" is the value the design exists to prevent: it invites 摊派');
});

test('insufficient needs no basis — that is what insufficient means', () => {
  const { region_basis: _drop, ...noBasis } = obs({ region: 'insufficient' });
  assert.equal(checkObservation(noBasis), true);
  // …but a real region does need one.
  const { region_basis: _b2, ...usNoBasis } = obs();
  assert.throws(() => checkObservation(usNoBasis), /region_basis/);
});

test('unattributable needs two conflicting bases; one signal cannot conflict with itself', () => {
  assert.throws(
    () => checkObservation(obs({ region: 'unattributable', region_basis: ['language'] })),
    /one signal cannot conflict with itself/,
  );
  assert.equal(checkObservation(obs({ region: 'unattributable', region_basis: ['language', 'currency'] })), true);
});

test('first_seen_at after fetched_at is refused', () => {
  assert.throws(
    () => checkObservation(obs({ first_seen_at: '2026-10-09T00:00:00Z' })),
    /cannot be seen for the first time after/,
  );
});

test('a migration is read-side: records stay byte-identical on disk and stay readable both ways', async () => {
  const { dir, ledger } = await tmp();
  try {
    await ingest(ledger, batch());
    const before = await readFile(ledger, 'utf8');

    const mig = await run(['migrate', ledger, '--from', '1', '--to', '2', '--rename', 'likes=like_count', '--default', 'shares=0']);
    assert.equal(mig.code, 0, mig.out);

    const after = await readFile(ledger, 'utf8');
    assert.ok(after.startsWith(before), 'the original lines must be untouched — a migration that rewrites history destroys the version number\'s meaning');
    assert.match(after.slice(before.length), /"kind":"migration"/);

    const { observations, migrations } = await readLedger(ledger);
    const [migrated] = view(observations, migrations);
    assert.equal(migrated.versions.schema, 2);
    assert.equal(migrated.raw.like_count, 10, 'the rename is applied on read');
    assert.equal(migrated.raw.shares, 0, 'the default is applied on read');

    // Without the lens, the old record still reads exactly as written.
    const [raw] = view(observations, []);
    assert.equal(raw.versions.schema, 1);
    assert.equal(raw.raw.likes, 10);
    assert.equal(raw.raw.like_count, undefined);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('verify reports a run cited by an observation that is not in the ledger', async () => {
  const { dir, ledger } = await tmp();
  try {
    await ingest(ledger, batch({
      observations: [obs({ source_task_id: 'task-imaginary' })],
    }));
    const { runs, observations } = await readLedger(ledger);
    const problems = verify({ runs, observations });
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.match(problems[0], /not in the ledger/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('verify reports duplicate observation records at the same fetch time', async () => {
  const { dir, ledger } = await tmp();
  try {
    await ingest(ledger, batch());
    // Hand-append a duplicate, which is what a second writer would do.
    await writeFile(ledger, (await readFile(ledger, 'utf8'))
      + JSON.stringify({ kind: 'observation', ledger_version: 1, ...obs() }) + '\n');
    const { runs, observations } = await readLedger(ledger);
    assert.match(verify({ runs, observations }).join('\n'), /duplicate observation record/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a count with no records behind it is rejected', async () => {
  const { dir, ledger } = await tmp();
  try {
    await assert.rejects(
      () => ingest(ledger, batch({ run: { items: 7 }, observations: [] })),
      /count with no records behind it/,
    );
  } finally { await rm(dir, { recursive: true, force: true }); }
});
