#!/usr/bin/env node
/**
 * collect-audit — the three numbers that say whether collection is lying.
 *
 * Everything downstream is a function of what this layer produced. All three
 * failures it measures are silent: the pipeline runs, the reports render, and the
 * numbers are wrong in ways that look like findings.
 *
 *   时滞     same item, two fetches, interaction count grew. If the interval
 *            between fetches differs by region, "scraped later" reads as "more
 *            popular" — and region is exactly the unit being compared.
 *   去重率   near-zero means cross-source duplicates are being counted once per
 *            copy; near-one means the fingerprint is so coarse it merges distinct
 *            items, and volume collapses.
 *   缺抓率   a source that fetched nothing and said nothing. This is the state that
 *            silently becomes "no anomaly today".
 *
 * Three outcomes, as everywhere in this repo: passed, failed, and 无法判断. The third
 * exists because the honest answer to "is this audit any good" is sometimes "these
 * inputs cannot tell you", and a two-state gate would call that a pass.
 *
 * Usage:
 *   node scripts/collect-audit.mjs <ledger.jsonl> [--json]
 *   node scripts/collect-audit.mjs --demo
 *
 * Input is the ledger written by collect-store.mjs: one JSON record per line, kinds
 * `run` and `observation`.
 */
import { readFile } from 'node:fs/promises';
import { REGION_NAMESPACE } from './collect-store.mjs';

const RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m',
      DIM = '\x1b[2m', BOLD = '\x1b[1m', RESET = '\x1b[0m';

// Thresholds. Fixed here rather than passed in, because a gate whose limit is a
// command-line argument is a gate that gets tuned until it passes.
//
// The dedup band is wide on purpose: the design says the cross-source threshold has
// to be calibrated on real data and cannot be guessed. 10% / 90% are not the
// calibration, they are the bounds of "something is structurally broken" — below
// 10% no cross-source dedup is happening at all, above 90% the fingerprint is
// merging distinct items and the volume is collapsing.
const DEDUP_MIN = 0.10;
const DEDUP_MAX = 0.90;
/** Latency spread beyond this, across regions, contaminates a cross-region comparison. */
const LATENCY_SPREAD_HOURS = 72;

const hours = (ms) => ms / 3_600_000;

function readLedger(text) {
  const runs = [], observations = [];
  text.split('\n').forEach((line, i) => {
    const t = line.trim();
    if (t === '') return;
    let rec;
    try { rec = JSON.parse(t); } catch { throw new Error(`line ${i + 1} is not JSON`); }
    if (rec.kind === 'run') runs.push(rec);
    else if (rec.kind === 'observation') observations.push(rec);
  });
  return { runs, observations };
}

/**
 * A ledger with each of the three failures planted, so the audit can be shown to
 * catch them rather than merely to run.
 *
 * Deterministic: a failing audit that is also flaky cannot be told apart from a
 * broken one, and the first thing anyone does with a red gate is run it again.
 */
function demo() {
  const runs = [], observations = [];
  /*
   * Each region is fetched twice, with a *different* gap: 2 days for US, 6 for DE.
   * That 4-day spread is the contaminant — DE's items are older at the moment of
   * their second count, so DE growth is larger for a reason that has nothing to do
   * with demand, and region is exactly the unit being compared.
   *
   * Fingerprints are region-prefixed. The first version reused `fp-N` in both
   * regions, which is impossible content-wise (one post belongs to one market) and
   * silently merged the two regions into one history each — the demo was measuring
   * its own bug and reporting a single region.
   */
  const plan = [
    { region: 'US', fetches: ['2026-10-01T00:00:00Z', '2026-10-03T00:00:00Z'], items: 12 },
    { region: 'DE', fetches: ['2026-10-01T00:00:00Z', '2026-10-07T00:00:00Z'], items: 12 },
  ];
  const growthPerDay = 0.08;   // 8% interaction growth per day of post age
  for (const p of plan) {
    for (const [n, fetched] of p.fetches.entries()) {
      const runId = `${p.region.toLowerCase()}-${n}`;
      runs.push({
        kind: 'run', ledger_version: 1, source: 'tiktok', run_id: runId,
        source_task_id: `task-${runId}`, fetched_at: fetched, status: 'ok', items: p.items,
      });
      const daysIn = (Date.parse(fetched) - Date.parse(p.fetches[0])) / 86_400_000;
      for (let i = 0; i < p.items; i++) {
        observations.push({
          kind: 'observation', ledger_version: 1,
          source: 'tiktok', fingerprint: `${p.region}-fp-${i}`,
          first_seen_at: p.fetches[0], fetched_at: fetched, source_task_id: `task-${runId}`,
          schema_version: 1, taxonomy_version: 1, metric_version: 1,
          region: p.region, region_basis: 'hashtag:v1',
          raw: { likes: Math.round(10 * (1 + growthPerDay) ** daysIn) },
        });
      }
    }
  }
  // A second source, so the dedup rate has more than one source to work across —
  // with one source there is no cross-source duplicate to find, and measuring it
  // there reports a healthy pipeline as broken.
  //
  // Three posts from Instagram, and the two that matter are 0 and 1: same text,
  // different ids, i.e. a repost the fingerprint did *not* catch. That is the shape
  // the audit exists to surface — the collection looks complete and the volume is
  // double-counted for that content, silently.
  const repostText = 'momcozy bottle warmer review after two months of night feeds';
  runs.push({
    kind: 'run', ledger_version: 1, source: 'instagram', run_id: 'ig-0',
    source_task_id: 'task-ig', fetched_at: '2026-10-07T00:00:00Z', status: 'ok', items: 3,
  });
  for (let i = 0; i < 3; i++) {
    observations.push({
      kind: 'observation', ledger_version: 1,
      source: 'instagram', fingerprint: `IG-${i}`,
      first_seen_at: '2026-10-07T00:00:00Z', fetched_at: '2026-10-07T00:00:00Z',
      source_task_id: 'task-ig',
      schema_version: 1, taxonomy_version: 1, metric_version: 1,
      region: 'US', region_basis: 'location:v1',
      raw: {
        likes: 5 + i,
        text: i === 2 ? 'unrelated caption about stroller storage' : repostText,
      },
      // The third row is flagged by the fingerprint; rows 0 and 1 are not, though a
      // coarse key sees they are the same post.
      ...(i === 2 ? { dup_of: 'US-fp-2' } : {}),
    });
  }
  // A source that was due and produced nothing, with its run recorded — healthy.
  runs.push({
    kind: 'run', ledger_version: 1, source: 'youtube', run_id: 'yt-0',
    source_task_id: 'task-yt', fetched_at: '2026-10-07T00:00:00Z', status: 'ok', items: 0,
  });
  return { runs, observations };
}

/** Group observations into per-item histories, newest last. */
function histories(observations) {
  const by = new Map();
  for (const o of observations) {
    const k = `${o.source}\u0000${o.fingerprint}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(o);
  }
  for (const list of by.values()) list.sort((a, b) => Date.parse(a.fetched_at) - Date.parse(b.fetched_at));
  return by;
}

/**
 * Latency: for items seen more than once, how much did the interaction count move
 * between the first and the last sighting, and how much did the fetch interval vary?
 *
 * Both halves matter. A large growth with a constant interval is the normal growth
 * curve and can be corrected. A large *variation in the interval* is what cannot be
 * corrected, because it mixes with the region effect.
 */
function latencyAudit(by) {
  const deltas = [];        // { fingerprint, region, days, growth }
  for (const [k, list] of by) {
    if (list.length < 2) continue;
    const first = list[0], last = list[list.length - 1];
    const a = first.raw?.likes, b = last.raw?.likes;
    if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0) continue;
    deltas.push({
      key: k.split('\u0000')[1],
      region: last.region ?? 'insufficient',
      days: hours(Date.parse(last.fetched_at) - Date.parse(first.fetched_at)) / 24,
      growth: (b - a) / a,
    });
  }

  const byRegion = new Map();
  for (const d of deltas) {
    if (!byRegion.has(d.region)) byRegion.set(d.region, []);
    byRegion.get(d.region).push(d);
  }
  const perRegion = [...byRegion.entries()].map(([region, ds]) => ({
    region,
    n: ds.length,
    medianDays: median(ds.map((d) => d.days)),
  }));

  const attributable = perRegion.filter((r) => /^[A-Z]{2}$/.test(r.region) && r.n >= 3);
  let spread = null;
  if (attributable.length >= 2) {
    const meds = attributable.map((r) => r.medianDays);
    spread = Math.max(...meds) - Math.min(...meds);
  }

  const growths = deltas.map((d) => d.growth);
  return {
    items_seen_twice: deltas.length,
    regions: perRegion.sort((a, b) => a.region.localeCompare(b.region)),
    spread_days: spread,
    median_growth: growths.length === 0 ? null : median(growths),
    // The one number that cannot be corrected after the fact.
    growth_range: growths.length === 0 ? null : [Math.min(...growths), Math.max(...growths)],
  };
}

function median(xs) {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

/**
 * Dedup: does the fingerprint scheme actually find the duplicates a coarser key can
 * see?
 *
 * The obvious metric — "what share of rows are repeats" — is worthless, and it took
 * building it to see why. A repost rate of 2% means either (a) the content is
 * genuinely clean, or (b) the fingerprint catches nothing. The two need opposite
 * responses and produce the identical number. That is the same shape as every other
 * failure this repo has recorded: a measurement that reads the same whether or not
 * the thing it measures exists.
 *
 * So this compares two keys:
 *
 *   coarse    content-ish identity from fields that need no cleverness: normalised
 *             text prefix, or author + post time. Two rows sharing one are
 *             *suspected* duplicates.
 *   fingerprint  what the adapter decided (`dup_of` names the row it believes it
 *             repeats).
 *
 * The measured quantity is recall: of the suspected duplicates the coarse key finds,
 * how many did the fingerprint flag? A scheme that misses half of them inflates
 * volume by an unknown factor and cannot be fixed downstream.
 *
 * When the payload carries no field a coarse key can be built from, this reports
 * 无法判断 rather than 0% — the alternative is a green audit over an input that
 * cannot move.
 */
function coarseKey(o) {
  const raw = o.raw ?? {};
  if (typeof raw.text === 'string' && raw.text.trim() !== '') {
    const norm = raw.text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 60);
    if (norm.length >= 12) return `text:${norm}`;
  }
  if (raw.author !== undefined && raw.posted_at !== undefined) {
    return `author:${raw.author}@${raw.posted_at}`;
  }
  return null;
}

function dedupAudit(runs, observations) {
  const groups = new Map();
  let keyable = 0;
  for (const o of observations) {
    const k = coarseKey(o);
    if (k === null) continue;
    keyable += 1;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(o);
  }

  // Only groups with more than one *distinct fingerprint* are suspected duplicates:
  // two rows with the same fingerprint are the same row, which the store already
  // forbids, and counting them here would credit the scheme for work it did not do.
  const suspected = [];
  for (const [, list] of groups) {
    const prints = new Set(list.map((o) => o.fingerprint));
    if (prints.size > 1) suspected.push(list);
  }

  let caught = 0;
  for (const list of suspected) {
    const flagged = list.filter((o) => typeof o.dup_of === 'string' && o.dup_of !== '');
    if (flagged.length > 0) caught += 1;
  }

  const sources = new Set(observations.map((o) => o.source));
  return {
    considered: observations.length,
    keyable,
    sources: sources.size,
    suspected: suspected.length,
    caught,
    // The number that matters: recall of the fingerprint scheme against a coarse check.
    recall: suspected.length === 0 ? null : caught / suspected.length,
    // Still reported, because a very high value means the scheme is over-merging.
    flagged_share: observations.length === 0 ? null
      : observations.filter((o) => typeof o.dup_of === 'string' && o.dup_of !== '').length / observations.length,
  };
}

/**
 * Miss rate: sources that were expected to run and did not.
 *
 * A run with status `ok` and zero items is a *result* — the source was reached and
 * had nothing. A run with status `error` is a known miss. Absence of a run is the
 * dangerous one, and it needs a separate input to detect: `expect` is not derivable
 * from the ledger, so it is reported as unmeasurable rather than guessed at zero.
 */
function missAudit(runs) {
  const bySource = new Map();
  for (const r of runs) {
    if (!bySource.has(r.source)) bySource.set(r.source, []);
    bySource.get(r.source).push(r);
  }
  const rows = [...bySource.entries()].map(([source, rs]) => {
    const ok = rs.filter((r) => r.status === 'ok').length;
    const partial = rs.filter((r) => r.status === 'partial').length;
    const error = rs.filter((r) => r.status === 'error').length;
    const empty = rs.filter((r) => r.status === 'ok' && (r.items ?? 0) === 0).length;
    return {
      source, runs: rs.length, ok, partial, error, empty,
      // Three states, kept apart. `empty` is the one that reads as "nothing to see".
      success_rate: rs.length === 0 ? null : (ok - empty) / rs.length,
    };
  }).sort((a, b) => a.source.localeCompare(b.source));
  return { sources: rows };
}

const json = process.argv.includes('--json');
const arg = process.argv.slice(2).find((a) => !a.startsWith('--'));

if (arg === undefined && !process.argv.includes('--demo')) {
  console.error('usage: collect-audit <ledger.jsonl> [--json] | --demo');
  process.exitCode = 2;
} else {
  let led = null;
  try {
    led = process.argv.includes('--demo')
      ? demo()
      : readLedger(await readFile(arg, 'utf8'));
  } catch (cause) {
    console.error(`${RED}cannot read ledger${RESET} — ${cause.message}`);
    process.exitCode = 2;
  }

  if (led !== null) {
    const by = histories(led.observations);
    const lat = latencyAudit(by);
    const ded = dedupAudit(led.runs, led.observations);
    const mis = missAudit(led.runs);

    // ── Verdict, three states ────────────────────────────────────────────────
    const failures = [];
    const inconclusive = [];

    if (lat.spread_days === null) {
      inconclusive.push(`时滞 spread cannot be measured: ${lat.regions.filter((r) => r.n >= 3 && /^[A-Z]{2}$/.test(r.region)).length} region(s) `
        + `with ≥3 re-seen items (need 2 to compare). One sighting per item cannot show a latency difference.`);
    } else if (lat.spread_days * 24 > LATENCY_SPREAD_HOURS) {
      failures.push(`时滞 spread is ${lat.spread_days.toFixed(1)} days across regions (limit `
        + `${LATENCY_SPREAD_HOURS / 24}). Different scrape times per region put scrape age into the `
        + `independent variable, and region is the thing being compared.`);
    }

    if (ded.recall === null) {
      if (ded.keyable === 0) {
        inconclusive.push(`去重率 cannot be measured: none of ${ded.considered} rows carries a field a `
          + `coarse key can be built from (no raw.text, no raw.author + raw.posted_at). `
          + `A rate of 0% here would mean "no duplicates" and "no way to look" at the same time.`);
      } else {
        inconclusive.push(`去重率 has no denominator: ${ded.keyable} rows were keyable and none of them `
          + `collide, so there are no suspected duplicates to test the fingerprint against. `
          + `That is a reason to collect more, not evidence that the scheme works.`);
      }
    } else if (ded.recall < DEDUP_MIN) {
      failures.push(`去重率 (recall) is ${(ded.recall * 100).toFixed(1)}% (floor ${DEDUP_MIN * 100}%) — of `
        + `${ded.suspected} suspected duplicate group(s) found by a coarse key, the fingerprint flagged only `
        + `${ded.caught}. Volume is inflated by an unknown factor and this cannot be fixed downstream.`);
    } else if (ded.flagged_share !== null && ded.flagged_share > DEDUP_MAX) {
      failures.push(`去重率 flagged share is ${(ded.flagged_share * 100).toFixed(1)}% (ceiling ${DEDUP_MAX * 100}%) — `
        + `the fingerprint is merging distinct items and volume is collapsing.`);
    }

    for (const s of mis.sources) {
      if (s.runs > 0 && s.ok === 0 && s.error > 0) {
        failures.push(`source "${s.source}" has ${s.error} run(s) and 0 successful — an outage that `
          + `the downstream count reads as "quiet".`);
      }
    }

    if (json) {
      console.log(JSON.stringify({
        latency: lat, dedup: ded, miss: mis,
        verdict: failures.length > 0 ? 'failed' : inconclusive.length > 0 ? 'inconclusive' : 'passed',
        failures, inconclusive,
      }, null, 2));
      /*
       * The exit code is the verdict. The first version printed the JSON and fell
       * through without setting it, so `collect-audit --json` always exited 0 —
       * a machine-readable gate that could never fail. Nobody would have noticed:
       * the JSON said "failed" and the process said fine, and anything wired to the
       * exit code (CI, a cron, a pre-commit hook) reads the process.
       */
      process.exitCode = failures.length > 0 ? 1 : inconclusive.length > 0 ? 2 : 0;
    } else {
      console.log(`\n${BOLD}采集审计${RESET} ${DIM}three numbers that say whether collection is lying${RESET}\n`);

      console.log(`${BOLD}时滞${RESET} ${DIM}same item, later fetch — growth is correctable, a varying interval is not${RESET}`);
      if (lat.items_seen_twice === 0) {
        console.log(`  ${YELLOW}no item was seen twice${RESET} — one sighting per item cannot show latency bias`);
      } else {
        console.log(`  ${lat.items_seen_twice} items seen twice`
          + (lat.median_growth === null ? '' : `, median interaction growth ${(lat.median_growth * 100).toFixed(1)}%`)
          + (lat.growth_range === null ? '' : ` ${DIM}[${(lat.growth_range[0] * 100).toFixed(0)}%, ${(lat.growth_range[1] * 100).toFixed(0)}%]${RESET}`));
        for (const r of lat.regions) {
          console.log(`    ${r.region.padEnd(15)}${String(r.n).padStart(3)} items  ${DIM}median gap ${Number.isNaN(r.medianDays) ? '—' : r.medianDays.toFixed(1) + 'd'}${RESET}`);
        }
        if (lat.spread_days !== null) {
          const colour = lat.spread_days * 24 > LATENCY_SPREAD_HOURS ? RED : GREEN;
          console.log(`  ${colour}spread across regions: ${lat.spread_days.toFixed(1)} days${RESET}`);
        }
      }
      console.log();

      console.log(`${BOLD}去重率${RESET} ${DIM}within one batch, how much of the volume is content already seen${RESET}`);
      if (ded.recall === null) {
        console.log(`  ${YELLOW}无法测量${RESET} ${DIM}— ${ded.keyable}/${ded.considered} rows keyable, `
          + `${ded.suspected} suspected duplicate group(s). A rate of 0% here would mean both `
          + `"no duplicates" and "no way to look".${RESET}`);
      } else {
        const colour = ded.recall < DEDUP_MIN ? RED : GREEN;
        console.log(`  ${colour}recall ${(ded.recall * 100).toFixed(1)}%${RESET} ${DIM}— of ${ded.suspected} group(s) a coarse key `
          + `calls duplicates, the fingerprint flagged ${ded.caught}${RESET}`);
        console.log(`  ${DIM}flagged share ${(ded.flagged_share * 100).toFixed(1)}% of ${ded.considered} rows `
          + `(${ded.sources} sources) · floor ${DEDUP_MIN * 100}%, ceiling ${DEDUP_MAX * 100}%${RESET}`);
      }
      console.log();

      console.log(`${BOLD}缺抓率${RESET} ${DIM}ok / partial / error / empty, kept apart on purpose${RESET}`);
      for (const s of mis.sources) {
        const colour = s.ok === 0 && s.error > 0 ? RED : GREEN;
        console.log(`  ${colour}${s.source.padEnd(12)}${RESET}${s.runs} runs · ok ${s.ok} · partial ${s.partial}`
          + ` · error ${s.error} · empty ${s.empty}`);
      }
      if (mis.sources.length === 0) console.log(`  ${YELLOW}no runs recorded${RESET}`);
      console.log(`  ${DIM}"empty" is a result: the source was reached and had nothing. `
        + `"no run at all" is the dangerous one, and it is not derivable from the ledger — `
        + `it needs the expected schedule as a separate input.${RESET}`);
      console.log();

      if (failures.length > 0) {
        console.log(`${RED}不通过 — ${failures.length} failure(s)${RESET}\n`);
        for (const f of failures) console.log(`  ${RED}•${RESET} ${f}`);
        console.log();
        process.exitCode = 1;
      } else if (inconclusive.length > 0) {
        console.log(`${YELLOW}无法判断 — ${inconclusive.length} thing(s) these inputs cannot answer${RESET}\n`);
        for (const c of inconclusive) console.log(`  ${YELLOW}•${RESET} ${c}`);
        console.log(`\n  ${DIM}This is not a pass. A green audit over an input that cannot move is `
          + `the failure this repo keeps finding.${RESET}\n`);
        process.exitCode = 2;
      } else {
        console.log(`${GREEN}通过${RESET} — latency, dedup and miss rate are all inside their bands\n`);
        process.exitCode = 0;
      }
    }
  }
}
