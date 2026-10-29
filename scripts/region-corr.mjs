#!/usr/bin/env node
/**
 * region-corr — the §七 kill switch.
 *
 * The whole product rests on one assumption: that regions have enough independent
 * variation in social volume for week fixed effects to leave something to identify
 * from. If a US creator's video is watched in Germany, and one global KOL push
 * starts every region's volume in the same week, then week fixed effects absorb
 * *the signal itself* and the panel estimates nothing — while still producing
 * numbers, intervals and a dashboard that look entirely normal.
 *
 * So this runs before anything is built, and it can say no.
 *
 * Three outcomes, not two. A gate that only knows pass and fail will, on a
 * malformed input, report one of them — and both are wrong:
 *
 *   0  passed     identification holds (max |r| < 0.5)
 *   1  failed     identification does not hold (max |r| > 0.8) — stop, per §七
 *   2  inconclusive  the input cannot answer the question
 *
 * The middle band (0.5–0.8) passes but is reported as a limitation that every
 * downstream conclusion must carry. That is the design's own wording: 继续但必须报
 * 「有效变异有限」，结论只到 C1/C3.
 *
 * Usage:
 *   node scripts/region-corr.mjs data/weekly-volume.csv
 *   node scripts/region-corr.mjs --demo          # synthetic, known answer
 *   node scripts/region-corr.mjs - < data.csv    # from stdin
 *
 * Input: CSV with columns `week,region,value` and optionally `batch`.
 *   week    an ISO week or any sortable label, e.g. 2025-W14
 *   region  ISO 3166 alpha-2, e.g. US, DE
 *   value   weekly volume for that region (already deduplicated and attributed)
 *   batch   optional fetch batch id; §七 requires one batch, see check below
 */
import { readFile } from 'node:fs/promises';
import { pearson, mean } from './stats.mjs';

const RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m',
      DIM = '\x1b[2m', BOLD = '\x1b[1m', RESET = '\x1b[0m';

const PASS_BELOW = 0.5;
const FAIL_ABOVE = 0.8;
const MIN_WEEKS = 8;

function parseCsv(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#'));
  if (lines.length < 2) throw new Error('need a header row and at least one data row');
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const at = (name) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`no "${name}" column — header is: ${header.join(', ')}`);
    return i;
  };
  const iw = at('week'), ir = at('region'), iv = at('value');
  const ib = header.indexOf('batch');

  const rows = [];
  for (const line of lines.slice(1)) {
    const c = line.split(',').map((x) => x.trim());
    const value = Number(c[iv]);
    if (!Number.isFinite(value)) throw new Error(`non-numeric value in row: ${line}`);
    if (c[iw] === '' || c[ir] === '') throw new Error(`missing week or region in row: ${line}`);
    rows.push({ week: c[iw], region: c[ir], value, batch: ib < 0 ? '' : c[ib] });
  }
  return rows;
}

/**
 * A synthetic dataset with an answer that is known in advance.
 *
 * It exists so the gate can be tested both ways without a live Apify tenant. The
 * two halves are deliberately shaped after the real risk: `sync` regions share one
 * driver, `indep` regions have their own. A gate that cannot separate these two is
 * not measuring independence, it is measuring "did the numbers load".
 */
function demoRows() {
  // Deterministic pseudo-random: the same input must produce the same verdict, or
  // a failing gate is indistinguishable from a flaky one.
  let seed = 20261028;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const rows = [];
  for (let w = 0; w < 12; w++) {
    const week = `2025-W${String(w + 1).padStart(2, '0')}`;
    const common = 100 + w * 6 + Math.sin(w / 2) * 9;   // the global driver
    rows.push({ week, region: 'US', value: Math.round(common + rnd() * 4), batch: 'b1' });
    rows.push({ week, region: 'DE', value: Math.round(common + rnd() * 4), batch: 'b1' });
    rows.push({ week, region: 'JP', value: Math.round(90 + rnd() * 40), batch: 'b1' });
  }
  return rows;
}

function alignedSeries(rows) {
  const byRegion = new Map();
  for (const r of rows) {
    if (!byRegion.has(r.region)) byRegion.set(r.region, new Map());
    byRegion.get(r.region).set(r.week, r.value);
  }
  // Intersect on weeks: comparing regions over different week ranges is comparing
  // two different questions, and Pearson will happily answer it anyway.
  const weeks = [...new Set(rows.map((r) => r.week))].sort();
  const present = weeks.filter((w) => [...byRegion.values()].every((m) => m.has(w)));
  const regions = [...byRegion.keys()].sort();
  return { regions, weeks: present, byRegion };
}

const path = process.argv[2];
if (path === undefined) {
  console.error(`usage: region-corr <data.csv | --demo | ->`);
  process.exitCode = 2;
} else {
  let rows;
  try {
    rows = path === '--demo'
      ? demoRows()
      : parseCsv(await (path === '-' ? readFile(0, 'utf8') : readFile(path, 'utf8')));
  } catch (cause) {
    console.error(`${RED}cannot read data${RESET} — ${cause.message}`);
    process.exitCode = 2;
    rows = null;
  }

  if (rows !== null) {
    const batches = [...new Set(rows.map((r) => r.batch).filter((b) => b !== ''))];
    const { regions, weeks, byRegion } = alignedSeries(rows);

    console.log(`\n${BOLD}§七 区域声量相关性${RESET} ${DIM}the only fatal risk, measured before building${RESET}\n`);
    console.log(`  ${regions.length} regions × ${weeks.length} common weeks`);
    if (batches.length > 1) {
      console.log(`  ${YELLOW}${batches.length} fetch batches present: ${batches.join(', ')}${RESET}`);
    }
    console.log();

    // ── Can the input answer the question at all? ────────────────────────────
    //
    // Each of these produces a NaN correlation, and NaN printed as a number is
    // exactly the failure this repo keeps finding: something that reads as a
    // measurement while measuring nothing.
    const blockers = [];
    if (regions.length < 2) blockers.push(`need at least 2 regions, have ${regions.length}`);
    if (weeks.length < MIN_WEEKS) {
      blockers.push(`need at least ${MIN_WEEKS} common weeks, have ${weeks.length} — `
        + `a correlation over fewer weeks is mostly noise`);
    }
    if (batches.length > 1) {
      blockers.push(`${batches.length} fetch batches — §七 requires one, because interaction counts `
        + `grow with post age and a stale fetch reads as a quiet region`);
    }

    const values = (region) => weeks.map((w) => byRegion.get(region).get(w));
    for (const region of regions) {
      const v = values(region);
      if (v.every((x) => x === v[0])) {
        blockers.push(`${region} has a flat series — no variation to identify from, `
          + `and its correlation would read as the region that saves the design`);
      }
    }

    if (blockers.length > 0) {
      console.log(`${YELLOW}无法判断 — inconclusive${RESET}\n`);
      for (const b of blockers) console.log(`  ${YELLOW}•${RESET} ${b}`);
      console.log(`\n  ${DIM}This is not a pass. Fix the input and run again — §七 的判据是`
        + `「能不能回答」，不是「数字看起来像多少」。${RESET}\n`);
      process.exitCode = 2;
    } else {
      const pairs = [];
      for (let i = 0; i < regions.length; i++) {
        for (let j = i + 1; j < regions.length; j++) {
          pairs.push({ a: regions[i], b: regions[j], r: pearson(values(regions[i]), values(regions[j])) });
        }
      }
      const worst = pairs.reduce((m, p) => (Math.abs(p.r) > Math.abs(m.r) ? p : m));

      // Matrix, because the pair that matters is not always the one you looked at.
      const width = 7;
      console.log(`  ${''.padEnd(6)}${regions.map((r) => r.padStart(width)).join('')}`);
      for (const a of regions) {
        const cells = regions.map((b) => {
          if (a === b) return '—'.padStart(width);
          const p = pairs.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
          return p.r.toFixed(3).padStart(width);
        });
        console.log(`  ${a.padEnd(6)}${cells.join('')}`);
      }
      console.log();

      const abs = Math.abs(worst.r);
      const verdict = abs > FAIL_ABOVE ? 'fail' : abs >= PASS_BELOW ? 'boundary' : 'pass';

      if (verdict === 'fail') {
        console.log(`${RED}识别不成立 — stop${RESET}`);
        console.log(`  max |r| = ${abs.toFixed(3)} between ${worst.a} and ${worst.b} (limit ${FAIL_ABOVE})`);
        console.log(`\n  ${DIM}各区域声量同步变动时，周固定效应吸收掉的正是信号本身。`
          + `诚实的结论：1 年窗口内做不了区域归因——不是「效应弱」，是没有可识别的效应。${RESET}`);
        console.log(`  ${DIM}可以转做品牌整体时间序列，但那条路依赖外生冲击，不是面板能解决的。${RESET}\n`);
        process.exitCode = 1;
      } else if (verdict === 'boundary') {
        console.log(`${YELLOW}边界 — proceed, but the limitation must travel with every conclusion${RESET}`);
        console.log(`  max |r| = ${abs.toFixed(3)} between ${worst.a} and ${worst.b}`);
        console.log(`\n  ${DIM}继续，但每条结论必须报「有效变异有限」，且只到 C1/C3。`
          + `这是设计给的判定，不是本脚本加的。${RESET}\n`);
        process.exitCode = 0;
      } else {
        console.log(`${GREEN}面板识别成立${RESET}`);
        console.log(`  max |r| = ${abs.toFixed(3)} between ${worst.a} and ${worst.b} (limit ${PASS_BELOW})`);
        const m = mean(pairs.map((p) => Math.abs(p.r)));
        console.log(`  ${DIM}mean |r| across ${pairs.length} pairs: ${m.toFixed(3)}${RESET}\n`);
        process.exitCode = 0;
      }
    }
  }
}
