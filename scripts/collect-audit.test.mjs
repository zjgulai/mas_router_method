#!/usr/bin/env node
/**
 * Tests for the collection audit.
 *
 * Each test plants one of the three silent failures and checks it is caught — and,
 * just as importantly, checks that a *healthy* ledger does not trip it. A gate that
 * only fires on bad data is half a gate; one that fires on good data gets switched
 * off within a week, and then the bad data goes through too.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeAndConfirm } from './test-fs.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (args) => promisify(execFile)(process.execPath, [join(ROOT, 'scripts/collect-audit.mjs'), ...args])
  .then((r) => ({ code: 0, out: r.stdout }))
  .catch((e) => ({ code: e.code ?? 1, out: (e.stdout ?? '') + (e.stderr ?? '') }));

const H = 3_600_000;

/** Write a ledger and audit it; returns the parsed --json verdict. */
async function audit(runs, observations) {
  const dir = await mkdtemp(join(tmpdir(), 'audit-'));
  const path = join(dir, 'ledger.jsonl');
  try {
    const lines = [
      ...runs.map((r) => JSON.stringify({ kind: 'run', ledger_version: 1, ...r })),
      ...observations.map((o) => JSON.stringify({ kind: 'observation', ledger_version: 1, schema_version: 1, taxonomy_version: 1, metric_version: 1, ...o })),
    ];
    // writeAndConfirm, not writeFile: INC-002 makes a fresh process read a stale
    // block back off this mount about one time in three, and the audit runs in a
    // fresh process. Without it these tests fail for reasons unrelated to the audit.
    await writeAndConfirm(path, lines.join('\n') + '\n');
    const { code, out } = await run([path, '--json']);
    return { code, json: JSON.parse(out) };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

const at = (h) => new Date(Date.UTC(2026, 9, 1) + h * H).toISOString();

/**
 * A healthy two-source ledger: two regions fetched on the same schedule, one real
 * cross-source repost that the fingerprint catches.
 */
function healthy() {
  const runs = [
    { source: 'tiktok', run_id: 't1', source_task_id: 'task-t1', fetched_at: at(0), status: 'ok', items: 6 },
    { source: 'tiktok', run_id: 't2', source_task_id: 'task-t2', fetched_at: at(24), status: 'ok', items: 6 },
    { source: 'instagram', run_id: 'i1', source_task_id: 'task-i1', fetched_at: at(24), status: 'ok', items: 2 },
  ];
  const observations = [];
  for (const region of ['US', 'DE']) {
    for (let i = 0; i < 3; i++) {
      for (const [n, hours] of [[0, 0], [1, 24]]) {
        observations.push({
          source: 'tiktok', fingerprint: `${region}-${i}`,
          first_seen_at: at(0), fetched_at: at(hours), source_task_id: n === 0 ? 'task-t1' : 'task-t2',
          region, region_basis: 'hashtag:v1',
          raw: { likes: 10, text: `post ${region} number ${i} about night feeding` },
        });
      }
    }
  }
  const dupText = 'same review reposted on two platforms about the warmer';
  observations.push({
    source: 'instagram', fingerprint: 'IG-a', first_seen_at: at(24), fetched_at: at(24),
    source_task_id: 'task-i1', region: 'US', region_basis: 'location:v1',
    raw: { likes: 4, text: dupText },
  });
  observations.push({
    source: 'instagram', fingerprint: 'IG-b', first_seen_at: at(24), fetched_at: at(24),
    source_task_id: 'task-i1', region: 'US', region_basis: 'location:v1',
    raw: { likes: 9, text: `${dupText}!` }, dup_of: 'US-0',
  });
  return { runs, observations };
}

test('a healthy ledger passes, with no failure and no inconclusive', async () => {
  const { runs, observations } = healthy();
  const { code, json } = await audit(runs, observations);
  assert.equal(json.verdict, 'passed', JSON.stringify({ failures: json.failures, inconclusive: json.inconclusive }, null, 2));
  assert.equal(code, 0);
});

test('a latency spread across regions fails — scrape age is contaminating the regressor', async () => {
  const { runs, observations } = healthy();
  // Re-fetch DE a week late instead of a day late, and only DE.
  const late = observations.map((o) => (o.region === 'DE' && o.fetched_at === at(24)
    ? { ...o, fetched_at: at(24 * 7) } : o));
  const { code, json } = await audit(runs, late);
  assert.equal(json.verdict, 'failed');
  assert.equal(code, 1);
  assert.match(json.failures.join('\n'), /时滞 spread/);
});

test('one sighting per item is inconclusive, not a pass — it cannot show latency bias', async () => {
  const runs = [{ source: 'tiktok', run_id: 't1', source_task_id: 'task-t1', fetched_at: at(0), status: 'ok', items: 4 }];
  const observations = ['US', 'DE'].flatMap((region) => [0, 1].map((i) => ({
    source: 'tiktok', fingerprint: `${region}-${i}`, first_seen_at: at(0), fetched_at: at(0),
    source_task_id: 'task-t1', region, region_basis: 'hashtag:v1',
    raw: { likes: 5, text: `a distinct caption numbered ${region}${i} here` },
  })));
  const { code, json } = await audit(runs, observations);
  assert.equal(json.verdict, 'inconclusive', JSON.stringify(json, null, 2));
  assert.equal(code, 2);
  assert.match(json.inconclusive.join('\n'), /时滞 spread cannot be measured/);
});

test('a fingerprint that misses real duplicates fails, and the message says the volume is inflated', async () => {
  const { runs, observations } = healthy();
  // Same text, different ids, nothing flagged: the repost the scheme did not see.
  const blind = observations.map((o) => (o.source === 'instagram' ? { ...o, dup_of: undefined } : o));
  const { code, json } = await audit(runs, blind);
  assert.equal(json.verdict, 'failed');
  assert.equal(code, 1);
  assert.match(json.failures.join('\n'), /recall/);
  assert.match(json.failures.join('\n'), /inflated by an unknown factor/);
});

test('rows with no field a coarse key can use are inconclusive on dedup, not 0%', async () => {
  const runs = [{ source: 'tiktok', run_id: 't1', source_task_id: 'task-t1', fetched_at: at(0), status: 'ok', items: 2 }];
  const observations = [0, 1].map((i) => ({
    source: 'tiktok', fingerprint: `fp-${i}`, first_seen_at: at(0), fetched_at: at(0),
    source_task_id: 'task-t1', region: 'US', region_basis: 'hashtag:v1',
    raw: { likes: 5 },   // no text, no author+posted_at
  }));
  const { json } = await audit(runs, observations);
  assert.equal(json.verdict, 'inconclusive');
  assert.match(json.inconclusive.join('\n'), /coarse key/);
});

test('a source whose every run errored fails — the downstream count would read it as quiet', async () => {
  const { runs, observations } = healthy();
  const broken = [{ source: 'youtube', run_id: 'y1', source_task_id: 'task-y1', fetched_at: at(24), status: 'error', items: 0 }, ...runs];
  const { code, json } = await audit(broken, observations);
  assert.equal(code, 1);
  assert.match(json.failures.join('\n'), /youtube.*outage/s);
});

test('a source that ran and found nothing is healthy — empty is a result, not a failure', async () => {
  const { runs, observations } = healthy();
  const withEmpty = [{ source: 'youtube', run_id: 'y1', source_task_id: 'task-y1', fetched_at: at(24), status: 'ok', items: 0 }, ...runs];
  const { code, json } = await audit(withEmpty, observations);
  assert.equal(json.verdict, 'passed', JSON.stringify(json.failures, null, 2));
  assert.equal(code, 0);
});
