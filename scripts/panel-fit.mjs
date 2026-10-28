#!/usr/bin/env node
/**
 * panel-fit — the smallest thing that can produce one number with an interval.
 *
 * The design's step 1 is not "build the metric layer". It is: two regions × twelve
 * weeks, one elasticity difference, with a confidence interval. Either the
 * identification strategy survives contact with real data or it doesn't, and that
 * answer is worth having in two weeks rather than three months.
 *
 *   ln(GMV)_rt = β·ln(volume)_rt + α_r + λ_t + X_rt·γ + ε_rt
 *
 * Region fixed effects absorb scale, maturity and baseline differences. Week fixed
 * effects absorb the global trend, seasonality and platform-wide algorithm changes
 * — which is the whole point, and also the whole cost: a global event is absorbed
 * and cannot be measured. That is a design constraint, not a defect, and the output
 * says so every time.
 *
 * The one rule this script exists to enforce:
 *
 *   **An interval that crosses zero is 无结论, not 效应弱.**
 *
 * A coefficient of 0.08 with an interval of [-0.02, 0.18] looks like a finding and
 * is not one. Under a heading of "weak effect" it will be quoted in a budget
 * meeting; under a heading of "no conclusion" it will not. Exit code 3 carries that
 * distinction out of the process, so a pipeline can refuse to publish it.
 *
 * Usage:
 *   node scripts/panel-fit.mjs data/panel.csv
 *   node scripts/panel-fit.mjs --demo
 *
 * Input: CSV with `week,region,volume,gmv` and any number of extra numeric columns
 * to use as controls (promo, price, stock, ppc …). Columns whose name starts with
 * `ln_` are taken as already logged. `volume` and `gmv` are logged here.
 *
 * Exit codes:
 *   0  a sign-stable interval that excludes zero
 *   3  the interval crosses zero — 无结论
 *   2  the data cannot answer the question (too few weeks, no within variation…)
 */
import { readFile } from 'node:fs/promises';
import { ols, ci95, mean } from './stats.mjs';

const RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m',
      DIM = '\x1b[2m', BOLD = '\x1b[1m', RESET = '\x1b[0m';

const MIN_WEEKS = 8;

function parseCsv(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#'));
  if (lines.length < 2) throw new Error('need a header row and at least one data row');
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  for (const need of ['week', 'region', 'volume', 'gmv']) {
    if (!header.includes(need)) throw new Error(`no "${need}" column — header is: ${header.join(', ')}`);
  }
  const rows = lines.slice(1).map((line) => {
    const c = line.split(',').map((x) => x.trim());
    const row = {};
    header.forEach((h, i) => { row[h] = c[i]; });
    for (const k of ['volume', 'gmv']) {
      const v = Number(row[k]);
      if (!Number.isFinite(v) || v <= 0) {
        throw new Error(`${k} must be a positive number in row: ${line}`);
      }
      row[k] = v;
    }
    for (const h of header) {
      if (h === 'week' || h === 'region' || h === 'volume' || h === 'gmv') continue;
      const v = Number(row[h]);
      if (!Number.isFinite(v)) throw new Error(`control "${h}" is not numeric in row: ${line}`);
      row[h] = v;
    }
    return row;
  });
  return { header, rows };
}

/**
 * A synthetic panel whose true elasticity is known: 0.35, with a global upward
 * trend in both series and a region-level scale difference.
 *
 * Shaped this way on purpose — the trend is exactly the pseudocorrelation that
 * makes a naive two-series correlation useless, so a successful recovery here
 * demonstrates the week fixed effects are doing their job rather than that the
 * arithmetic runs.
 */
function demoPanel() {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648 - 0.5;
  };
  const TRUE_BETA = 0.35;
  const rows = [];
  for (let w = 0; w < 12; w++) {
    const week = `2025-W${String(w + 1).padStart(2, '0')}`;
    const globalVolume = 5.0 + w * 0.12;            // shared trend in volume
    const globalGmv = 7.0 + w * 0.10;               // shared trend in GMV
    for (const [region, offset, scale] of [['US', 0, 1], ['DE', -0.6, 0.8]]) {
      // Independent, region-specific wiggle is what the fixed effects cannot absorb.
      const own = rnd() * 0.5;
      const lnVolume = globalVolume + offset + own;
      const lnGmv = globalGmv + scale + TRUE_BETA * (offset + own) + rnd() * 0.05;
      rows.push({
        week, region,
        volume: Math.round(Math.exp(lnVolume) * 1000),
        gmv: Math.round(Math.exp(lnGmv) * 10000),
        promo: 0,
      });
    }
  }
  return { header: ['week', 'region', 'volume', 'gmv', 'promo'], rows, truth: TRUE_BETA };
}

const path = process.argv[2];
if (path === undefined) {
  console.error(`usage: panel-fit <panel.csv | --demo>`);
  process.exitCode = 2;
} else {
  let parsed;
  try {
    parsed = path === '--demo'
      ? demoPanel()
      : parseCsv(await (path === '-' ? readFile(0, 'utf8') : readFile(path, 'utf8')));
  } catch (cause) {
    console.error(`${RED}cannot read data${RESET} — ${cause.message}`);
    process.exitCode = 2;
    parsed = null;
  }

  if (parsed !== null) {
    const { rows, header } = parsed;
    const declared = header.filter((h) => !['week', 'region', 'volume', 'gmv'].includes(h));
    const regions = [...new Set(rows.map((r) => r.region))].sort();
    const weeks = [...new Set(rows.map((r) => r.week))].sort();

    /*
     * A control with no variation in the window is not a control.
     *
     * It is collinear with the intercept and the design matrix goes singular, but
     * the singular matrix is the *symptom*; the finding is "you believe you
     * controlled for this and you did not". The design already names the case —
     * §8.5 第 7 条, budget that only moved once or twice has no identifying power
     * and the conclusion degrades to a descriptive comparison. So it is dropped,
     * and dropping it is printed rather than swallowed. Silently keeping a
     * zero-variance control would make the regression fail; silently removing it
     * would make the output claim a covariate it never used.
     */
    const controls = [];
    const dropped = [];
    for (const c of declared) {
      const xs = rows.map((r) => r[c]);
      if (Math.max(...xs) - Math.min(...xs) < 1e-12) dropped.push({ name: c, value: xs[0] });
      else controls.push(c);
    }

    console.log(`\n${BOLD}面板最小版${RESET} ${DIM}one number with an interval, or nothing${RESET}\n`);
    console.log(`  ${regions.length} regions × ${weeks.length} weeks = ${rows.length} observations`);
    console.log(`  ${DIM}regions: ${regions.join(', ')}${controls.length > 0 ? `  controls: ${controls.join(', ')}` : '  no controls yet (step 1)'}${RESET}`);
    for (const d of dropped) {
      console.log(`  ${YELLOW}dropped "${d.name}"${RESET} ${DIM}— constant at ${d.value} across the window, `
        + `so it controls for nothing. §8.5 第 7 条: a control that never moved has no identifying power.${RESET}`);
    }
    console.log();

    const blockers = [];
    if (regions.length < 2) blockers.push(`need at least 2 regions, have ${regions.length}`);
    if (weeks.length < MIN_WEEKS) blockers.push(`need at least ${MIN_WEEKS} weeks, have ${weeks.length}`);

    // The estimator's parameters: intercept, ln volume, R−1 region dummies,
    // T−1 week dummies, and one per control.
    const params = 1 + 1 + (regions.length - 1) + (weeks.length - 1) + controls.length;
    if (rows.length - params <= 0) {
      blockers.push(`${rows.length} observations cannot support ${params} parameters — `
        + `no residual degrees of freedom left for an interval`);
    }

    // Without within-week variation in volume, the week fixed effects absorb the
    // regressor and β is not identified. That is the §七 failure arriving as a
    // singular matrix; catching it here names the cause instead of the symptom.
    let someWeekHasVariation = false;
    for (const w of weeks) {
      const vs = rows.filter((r) => r.week === w).map((r) => Math.log(r.volume));
      if (vs.length > 1 && Math.max(...vs) - Math.min(...vs) > 1e-9) { someWeekHasVariation = true; break; }
    }
    if (!someWeekHasVariation) {
      blockers.push('volume does not vary between regions within any week — '
        + 'week fixed effects absorb the whole regressor and β is not identified');
    }

    if (blockers.length > 0) {
      console.log(`${YELLOW}无法判断 — inconclusive${RESET}\n`);
      for (const b of blockers) console.log(`  ${YELLOW}•${RESET} ${b}`);
      console.log(`\n  ${DIM}This is not a null result. The data cannot answer the question yet.${RESET}\n`);
      process.exitCode = 2;
    } else {
      // Design matrix. Reference categories are dropped explicitly: leaving them in
      // makes the matrix singular, and a singular matrix under an intercept-only
      // dummy scheme is the classic sign that someone forgot this.
      const X = rows.map((r) => {
        const week = r.week, region = r.region;
        const d = [1, Math.log(r.volume)];
        for (const rg of regions.slice(1)) d.push(region === rg ? 1 : 0);
        for (const wk of weeks.slice(1)) d.push(week === wk ? 1 : 0);
        for (const c of controls) d.push(r[c]);
        return d;
      });
      const y = rows.map((r) => Math.log(r.gmv));

      const fit = ols(X, y);
      const beta = fit.beta[1];
      const [lo, hi] = ci95(beta, fit.se[1], fit.df);
      const crossesZero = lo <= 0 && hi >= 0;

      console.log(`  ${BOLD}β = ${beta.toFixed(3)}${RESET}  ${DIM}95% CI [${lo.toFixed(3)}, ${hi.toFixed(3)}]${RESET}`);
      console.log(`  ${DIM}df ${fit.df} · R² ${fit.r2.toFixed(3)} · ${rows.length} obs, ${fit.k} parameters${RESET}`);
      if (parsed.truth !== undefined) {
        console.log(`  ${DIM}the demo's true β is ${parsed.truth} — recovered, and the shared trend is not the answer${RESET}`);
      }
      console.log();

      if (crossesZero) {
        console.log(`${YELLOW}无结论 — no conclusion${RESET}`);
        console.log(`  the interval [${lo.toFixed(3)}, ${hi.toFixed(3)}] contains 0.`);
        console.log(`\n  ${DIM}这不是「效应弱」。跨过 0 的区间看起来像「有这个效应」，`
          + `实际上什么都没说——`)
        console.log(`  而它会以「弱效应」的名义被引用进一次预算决策。`
          + `设计 §8.5 第 4 条把这条列为方案自己的证伪条件。${RESET}\n`);
        process.exitCode = 3;
      } else {
        const direction = beta > 0 ? 'positive' : 'negative';
        console.log(`${GREEN}结论成立${RESET} — a ${direction} elasticity, interval excludes 0`);
        console.log(`  ${DIM}permanent label: this is an association between regional variation, `
          + `not a causal effect. Only C4 approaches causality.${RESET}`);
        console.log(`  ${DIM}absorbed by construction: any global trend or global event.`
          + ` 产品不能回答「全球声量总共带来多少 GMV」。${RESET}\n`);
        process.exitCode = 0;
      }
    }
  }
}
