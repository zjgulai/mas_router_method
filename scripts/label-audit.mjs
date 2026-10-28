#!/usr/bin/env node
/**
 * label-audit — accuracy and agreement for a labelling dimension.
 *
 * The design says two numbers gate this layer: **准确率 < 0.7 → 该维度不可用**,
 * **Kappa < 0.6 → 标签定义有歧义**. Both are computable without a model, so both
 * get a command rather than a paragraph.
 *
 * Three things this measures that a naive accuracy number does not:
 *
 *   1. **Kappa, not accuracy.** On a set that is 92% one class, a model that answers
 *      that class every time scores 92% and knows nothing. Accuracy alone makes a
 *      useless labeller look ready. Kappa subtracts the agreement chance would give.
 *
 *   2. **Accuracy by confidence band.** A labeller whose high-confidence answers are
 *      *less* accurate than its low-confidence ones has an inverted signal. That is
 *      worse than being uniformly wrong: every downstream use of `confidence` —
 *      thresholds, sensitivity analysis, "only trust > 0.8" — is then backwards, and
 *      nothing looks wrong.
 *
 *   3. **Whether the gold set can answer the question at all.** One class present, or
 *      thirty rows, or no confidence column: each makes a number that looks like a
 *      measurement and is not. That is exit 2, not exit 0.
 *
 * Usage:
 *   node scripts/label-audit.mjs gold.csv [--json]
 *   node scripts/label-audit.mjs --demo
 *
 * Input: CSV with `id,gold,predicted,confidence`.
 *   gold        the human label
 *   predicted   what the labeller said
 *   confidence  0–1, the labeller's own claim about this row
 *
 * Exit codes:
 *   0  passed — accuracy ≥ 0.7, Kappa ≥ 0.6, confidence is not inverted
 *   1  failed — one of those is violated
 *   2  inconclusive — the input cannot answer the question
 */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m',
      DIM = '\x1b[2m', BOLD = '\x1b[1m', RESET = '\x1b[0m';

const ACCURACY_MIN = 0.7;
const KAPPA_MIN = 0.6;
/** Below this, neither number means anything — it is noise wearing two decimals. */
const MIN_ROWS = 30;
/** The design's gold-set size, per label. Smaller is computed but flagged. */
const RECOMMENDED_ROWS = 200;

/** The design's confidence bands, used for the stratified view. */
const BANDS = [
  { name: '低 <0.6', test: (c) => c < 0.6 },
  { name: '中 0.6–0.8', test: (c) => c >= 0.6 && c <= 0.8 },
  { name: '高 >0.8', test: (c) => c > 0.8 },
];

function parseCsv(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#'));
  if (lines.length < 2) throw new Error('need a header row and at least one data row');
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const at = (name) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`no "${name}" column — header is: ${header.join(', ')}`);
    return i;
  };
  const ig = at('gold'), ip = at('predicted'), ic = at('confidence');
  const ii = header.indexOf('id');

  const rows = [];
  const problems = [];
  for (const [n, line] of lines.slice(1).entries()) {
    const c = line.split(',').map((x) => x.trim());
    const conf = Number(c[ic]);
    if (c[ig] === '' || c[ip] === '') {
      problems.push(`row ${n + 2}: empty gold or predicted label`);
      continue;
    }
    if (!Number.isFinite(conf) || conf < 0 || conf > 1) {
      problems.push(`row ${n + 2}: confidence "${c[ic]}" is not a number in 0–1`);
      continue;
    }
    rows.push({
      id: ii < 0 ? String(n + 1) : c[ii],
      gold: c[ig], predicted: c[ip], confidence: conf,
    });
  }
  return { rows, problems };
}

/**
 * Cohen's Kappa.
 *
 * Returns NaN when it is undefined rather than 0 — a Kappa of 0 means "no better than
 * chance", which is a finding. Undefined means "this input cannot say", which is a
 * different thing and must not be reported as a measurement.
 */
export function cohenKappa(pairs) {
  const n = pairs.length;
  if (n === 0) return Number.NaN;

  const labels = [...new Set(pairs.flatMap((p) => [p.gold, p.predicted]))].sort();
  if (labels.length < 2) return Number.NaN;

  const agree = pairs.filter((p) => p.gold === p.predicted).length;
  const po = agree / n;

  const goldCount = new Map(labels.map((l) => [l, 0]));
  const predCount = new Map(labels.map((l) => [l, 0]));
  for (const p of pairs) {
    goldCount.set(p.gold, goldCount.get(p.gold) + 1);
    predCount.set(p.predicted, predCount.get(p.predicted) + 1);
  }
  let pe = 0;
  for (const l of labels) pe += (goldCount.get(l) / n) * (predCount.get(l) / n);

  // pe === 1 happens when both sides put every row in one class. Kappa's denominator
  // goes to zero; the honest answer is "undefined", not infinity and not 1.
  if (Math.abs(1 - pe) < 1e-12) return Number.NaN;
  return (po - pe) / (1 - pe);
}

function audit(rows) {
  const pairs = rows.map((r) => ({ gold: r.gold, predicted: r.predicted }));
  const correct = rows.filter((r) => r.gold === r.predicted).length;
  const accuracy = rows.length === 0 ? Number.NaN : correct / rows.length;
  const kappa = cohenKappa(pairs);

  const byBand = BANDS.map((b) => {
    const inBand = rows.filter((r) => b.test(r.confidence));
    const hit = inBand.filter((r) => r.gold === r.predicted).length;
    return {
      name: b.name,
      n: inBand.length,
      accuracy: inBand.length === 0 ? null : hit / inBand.length,
    };
  });

  // Label distribution, because a number that is mostly one class makes accuracy
  // meaningless and the reader has to be able to see that without recomputing.
  const dist = new Map();
  for (const r of rows) dist.set(r.gold, (dist.get(r.gold) ?? 0) + 1);
  const sorted = [...dist.entries()].sort((a, b) => b[1] - a[1]);
  const majorityShare = rows.length === 0 ? null : sorted[0][1] / rows.length;

  // The baseline: answering the majority class for every row. Accuracy must beat this
  // by something, or it is describing the distribution rather than the labeller.
  const majorityBaseline = rows.length === 0 ? null : correct === 0 ? null
    : Math.max(...[...dist.entries()].map(([label]) =>
      rows.filter((r) => r.predicted === label).length / rows.length));

  return { accuracy, kappa, byBand, distribution: sorted, majorityShare, baseline: majorityBaseline, n: rows.length, correct };
}

/** A deterministic demo: one defect per region of the report, all visible at once. */
function demo() {
  // 240 rows like the design's gold set. True signal: `sentiment` positive/negative.
  // The labeller is mostly right but its confidence is inverted — on the rows it is
  // *most* sure about, it flips the answer. That is the failure the stratified view
  // exists for, and it is invisible in the headline accuracy.
  let seed = 20261028;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const rows = [];
  for (let i = 0; i < 240; i++) {
    const gold = rnd() < 0.55 ? 'positive' : 'negative';
    const conf = rnd();
    let predicted = gold;
    let confidence = conf;
    if (conf > 0.8) {
      // sure, and wrong more often than not
      predicted = rnd() < 0.55 ? (gold === 'positive' ? 'negative' : 'positive') : gold;
      confidence = 0.85 + rnd() * 0.1;
    } else if (conf < 0.6) {
      predicted = rnd() < 0.15 ? (gold === 'positive' ? 'negative' : 'positive') : gold;
      confidence = 0.35 + rnd() * 0.2;
    } else {
      predicted = rnd() < 0.25 ? (gold === 'positive' ? 'negative' : 'positive') : gold;
      confidence = 0.6 + rnd() * 0.2;
    }
    rows.push({ id: `g${i}`, gold, predicted, confidence });
  }
  return { rows, problems: [] };
}

/*
 * Guarded, because this file is also a module: the tests import `cohenKappa` from it.
 * Without the guard, importing it runs the CLI with the *test runner's* argv, falls
 * through to the usage branch, and sets `process.exitCode = 2` — so a file whose ten
 * tests all pass is reported as a failure, with no failing assertion to look at.
 *
 * This is the second time in this repo. `collect-store.mjs` had the same defect and the
 * same symptom. The guard belongs in the pattern, not in a memory of it.
 */
const invokedDirectly = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;

const argv = invokedDirectly ? process.argv.slice(2) : [];
const asJson = argv.includes('--json');
const target = argv.find((a) => !a.startsWith('--'));

if (!invokedDirectly) {
  // imported for its exports; nothing to do
} else if (target === undefined && !argv.includes('--demo')) {
  console.error('usage: label-audit <gold.csv> [--json] | --demo');
  process.exitCode = 2;
} else {
  let parsed = null;
  try {
    parsed = argv.includes('--demo') ? demo() : parseCsv(await readFile(target, 'utf8'));
  } catch (cause) {
    console.error(`${RED}cannot read gold set${RESET} — ${cause.message}`);
    process.exitCode = 2;
  }

  if (parsed !== null) {
    const { rows, problems } = parsed;
    const result = audit(rows);

    // ── Can this input answer the question at all? ──────────────────────────
    const blockers = [];
    if (rows.length < MIN_ROWS) {
      blockers.push(`only ${rows.length} usable rows — below ${MIN_ROWS}, accuracy and Kappa are noise wearing two decimals`);
    }
    /*
     * A single-class gold set makes the WHOLE report unanswerable, not just Kappa.
     *
     * The first version pushed this into `blockers` and also let `failures` fill from
     * accuracy — and the verdict preferred `failed` over `inconclusive`. So a gold set
     * with one class came back "failed", which sends a person to rewrite label
     * definitions when the actual problem is that the set was never collected. Opposite
     * actions, and the code picked the wrong one.
     *
     * So the single-class case suppresses the accuracy verdict entirely: accuracy on a
     * set that is 100% one class measures the class balance, not the labeller.
     */
    const goldClasses = new Set(rows.map((r) => r.gold));
    const oneClassGold = goldClasses.size < 2;

    if (oneClassGold) {
      blockers.push('the gold set contains a single class — both Kappa and accuracy are '
        + 'undefined here: Kappa has no chance baseline, and accuracy measures the class '
        + 'balance rather than the labeller. Collect a real gold set before judging this dimension.');
    } else if (Number.isNaN(result.kappa)) {
      if (new Set(rows.map((r) => r.predicted)).size < 2) {
        blockers.push('the labeller predicted one class for every row — Kappa is undefined; accuracy is the majority share');
      } else {
        blockers.push('Kappa is undefined on this input (both sides degenerate to one class)');
      }
    }

    const failures = [];
    if (!oneClassGold && !Number.isNaN(result.accuracy) && result.accuracy < ACCURACY_MIN) {
      failures.push(`accuracy ${(result.accuracy * 100).toFixed(1)}% < ${ACCURACY_MIN * 100}% — `
        + '该维度不可用，A2+/A2− 退化为 A1');
    }
    if (!oneClassGold && !Number.isNaN(result.kappa) && result.kappa < KAPPA_MIN) {
      failures.push(`Kappa ${result.kappa.toFixed(3)} < ${KAPPA_MIN} — 标签定义有歧义，`
        + '这是定义的问题，不是标注员的问题');
    }

    // Confidence inversion: the high band must not be worse than the low band.
    const low = result.byBand[0], high = result.byBand[2];
    let inverted = false;
    if (!oneClassGold && low.accuracy !== null && high.accuracy !== null && low.n >= 10 && high.n >= 10) {
      if (high.accuracy < low.accuracy) {
        inverted = true;
        failures.push(`confidence is inverted — 高置信度 band is ${(high.accuracy * 100).toFixed(1)}% accurate, `
          + `低置信度 band is ${(low.accuracy * 100).toFixed(1)}%. Everything downstream that trusts high confidence `
          + 'is then backwards, and nothing looks wrong.');
      }
    }

    const verdict = blockers.length > 0 ? 'inconclusive'
      : failures.length > 0 ? 'failed' : 'passed';

    if (asJson) {
      console.log(JSON.stringify({
        verdict,
        accuracy: result.accuracy, kappa: result.kappa,
        byBand: result.byBand, distribution: result.distribution,
        majorityShare: result.majorityShare, baseline: result.baseline,
        n: result.n, correct: result.correct,
        recommendedRows: RECOMMENDED_ROWS,
        confidenceInverted: inverted,
        failures, blockers, problems,
      }, null, 2));
      process.exitCode = verdict === 'failed' ? 1 : verdict === 'inconclusive' ? 2 : 0;
    } else {
      console.log(`\n${BOLD}打标审计${RESET} ${DIM}accuracy 与 Kappa，以及置信度是不是反的${RESET}\n`);
      console.log(`  ${result.n} rows, ${result.correct} correct`);
      if (problems.length > 0) {
        console.log(`  ${YELLOW}${problems.length} row(s) skipped${RESET} ${DIM}(malformed; see --json)${RESET}`);
      }
      if (result.n < RECOMMENDED_ROWS) {
        console.log(`  ${YELLOW}gold set is ${result.n} rows${RESET} ${DIM}— the design asks for ${RECOMMENDED_ROWS}–300 per label; `
          + `below that Kappa has a wide interval and this is a first look, not a verdict you should cite${RESET}`);
      }
      console.log();

      const fmt = (x) => (Number.isNaN(x) ? '—' : (x * 100).toFixed(1) + '%');
      const accColour = Number.isNaN(result.accuracy) ? DIM : result.accuracy < ACCURACY_MIN ? RED : GREEN;
      const kapColour = Number.isNaN(result.kappa) ? DIM : result.kappa < KAPPA_MIN ? RED : GREEN;
      console.log(`  accuracy  ${accColour}${fmt(result.accuracy)}${RESET} ${DIM}(floor ${ACCURACY_MIN * 100}%)${RESET}`);
      console.log(`  Kappa     ${kapColour}${Number.isNaN(result.kappa) ? '—' : result.kappa.toFixed(3)}${RESET} ${DIM}(floor ${KAPPA_MIN})${RESET}`);
      console.log();

      // Distribution first: a reader who does not see the class balance will read
      // accuracy as skill.
      console.log(`  ${BOLD}标签分布${RESET} ${DIM}gold 侧，因为准确率要跟它一起读${RESET}`);
      for (const [label, count] of result.distribution) {
        const share = (count / result.n) * 100;
        const bar = '█'.repeat(Math.max(0, Math.round(share / 4)));
        console.log(`    ${label.padEnd(14)}${String(count).padStart(4)}  ${share.toFixed(1).padStart(5)}%  ${DIM}${bar}${RESET}`);
      }
      if (result.majorityShare !== null) {
        console.log(`    ${DIM}majority share ${(result.majorityShare * 100).toFixed(1)}% — `
          + `always answering the top class scores that much, which is why Kappa is the number that matters${RESET}`);
      }
      console.log();

      console.log(`  ${BOLD}按置信度分层${RESET} ${DIM}高的应该比低的准；反过来说明 confidence 是反向信号${RESET}`);
      for (const b of result.byBand) {
        if (b.n === 0) { console.log(`    ${b.name.padEnd(12)}${DIM}— no rows${RESET}`); continue; }
        const colour = b.accuracy === null ? DIM : b.accuracy < ACCURACY_MIN ? RED : GREEN;
        console.log(`    ${b.name.padEnd(12)}${String(b.n).padStart(4)} rows  ${colour}${(b.accuracy * 100).toFixed(1)}%${RESET}`);
      }
      console.log();

      if (verdict === 'inconclusive') {
        console.log(`${YELLOW}无法判断 — ${blockers.length} thing(s) this input cannot answer${RESET}\n`);
        for (const b of blockers) console.log(`  ${YELLOW}•${RESET} ${b}`);
        console.log(`\n  ${DIM}This is not a pass. A dimension nobody could measure is not a dimension that works.${RESET}\n`);
        process.exitCode = 2;
      } else if (verdict === 'failed') {
        console.log(`${RED}不通过 — ${failures.length} failure(s)${RESET}\n`);
        for (const f of failures) console.log(`  ${RED}•${RESET} ${f}`);
        console.log();
        process.exitCode = 1;
      } else {
        console.log(`${GREEN}通过${RESET} — accuracy and agreement are above their floors, and confidence points the right way\n`);
        process.exitCode = 0;
      }
    }
  }
}
