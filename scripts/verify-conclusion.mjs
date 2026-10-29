#!/usr/bin/env node
/**
 * verify-conclusion — run the falsification checks, weekly, and refuse to stay quiet.
 *
 * This is the mechanism that separates a report from a dashboard. Every conclusion
 * card carries its falsification conditions; this script runs them and reports which
 * one fired. Without it those conditions are prose in a template — the exact thing
 * the design says must not happen ("证伪条件写成「如果结论错了」" is listed as a
 * failure of the design stage).
 *
 * Three outcomes and a distinct exit code for each, because the whole point is that
 * a caller can act on it:
 *
 *   0  every conclusion is active — all conditions evaluated and held
 *   1  at least one conclusion was falsified — this is the alert
 *   2  nothing fired, but something could not be evaluated
 *
 * Exit 2 exists because "we could not check" must not page as "all clear" *or* as
 * "conclusion dead". It is the state that silently becomes health in every pipeline
 * that only knows two answers.
 *
 * Usage:
 *   node scripts/verify-conclusion.mjs <conclusions.json>
 *   node scripts/verify-conclusion.mjs --demo
 *   node scripts/verify-conclusion.mjs <conclusions.json> --notify feishu --dry-run
 *
 * Input: `{ conclusions: [{ id, claim, status, conditions: [...], data: {...} }] }`
 *   status `superseded` is skipped — a conclusion already overturned is not re-checked,
 *   and re-reporting it weekly is how an alert channel gets muted.
 */
import { readFile } from 'node:fs/promises';
import { CONDITIONS, checkConclusion } from './conclusion-conditions.mjs';

const RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m',
      DIM = '\x1b[2m', BOLD = '\x1b[1m', RESET = '\x1b[0m';

function demo() {
  return {
    conclusions: [
      {
        id: 'C1',
        claim: '声量每提升 10%，US 的 GMV 提升 1.7%（1.2–2.2）',
        status: 'active',
        conditions: ['ci-excludes-zero', 'regional-sign-consistent', 'sample-adequate'],
        data: { beta_ci: [0.012, 0.022], region_betas: [0.17, 0.14, 0.19], n_obs: 260 },
      },
      {
        id: 'C2',
        claim: '效应在第 3 周达峰（2–4）',
        status: 'active',
        conditions: ['ci-excludes-zero', 'sample-adequate'],
        // The interval spans zero: this conclusion is the one the product must not
        // publish, and the demo exists to show the check catching it.
        data: { beta_ci: [-0.004, 0.011], n_obs: 260 },
      },
      {
        id: 'C3',
        claim: '某次投放带来增量 GMV 42 万',
        status: 'active',
        conditions: ['region-coverage-sufficient', 'labelling-accurate'],
        // No coverage number in the input: unmeasurable, not healthy.
        data: { kappa: 0.71, accuracy: 0.78 },
      },
      {
        id: 'C4',
        claim: '每单位声量的预算边际回报，DE 高于 US',
        status: 'superseded',
        conditions: ['budget-has-variation'],
        data: { budget_changes: 1 },
      },
    ],
  };
}

/**
 * Deliver an alert.
 *
 * `dry-run` prints what would be sent. A real transport is not wired yet, and a
 * transport that pretends to send is worse than none: the design's own acceptance
 * for this layer is "造了触发不报 → 不通过", so a fake send would pass the test and
 * fail the product.
 */
async function notify(channel, message, dryRun) {
  if (dryRun) {
    console.log(`${DIM}would send via ${channel}:${RESET}`);
    for (const line of message.split('\n')) console.log(`  ${DIM}│${RESET} ${line}`);
    return { sent: false, reason: 'dry run' };
  }
  // No transport configured. Returning an error rather than silently succeeding is
  // the point: an alert path that quietly drops is the failure this layer prevents.
  return {
    sent: false,
    reason: 'no transport configured — set FEISHU_WEBHOOK or pass --dry-run. '
      + 'A channel that pretends to deliver turns a red conclusion into a silent one.',
  };
}

const argv = process.argv.slice(2);
const arg = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--notify');
const channel = argv.includes('--notify') ? argv[argv.indexOf('--notify') + 1] : null;
const dryRun = argv.includes('--dry-run');

if (arg === undefined && !argv.includes('--demo')) {
  console.error('usage: verify-conclusion <conclusions.json> [--notify feishu] [--dry-run] | --demo');
  process.exitCode = 2;
} else {
  let doc;
  try {
    doc = argv.includes('--demo') ? demo() : JSON.parse(await readFile(arg, 'utf8'));
  } catch (cause) {
    console.error(`${RED}cannot read conclusions${RESET} — ${cause.message}`);
    process.exitCode = 2;
    doc = null;
  }

  if (doc !== null) {
    const all = doc.conclusions ?? [];
    const superseded = all.filter((c) => c.status === 'superseded');
    const live = all.filter((c) => c.status !== 'superseded');

    console.log(`\n${BOLD}证伪检查${RESET} ${DIM}${live.length} active conclusion(s), `
      + `${superseded.length} superseded (not re-checked)${RESET}\n`);

    const perConclusion = live.map((c) => ({ c, ...checkConclusion(c.conditions ?? [], c.data ?? {}) }));

    for (const { c, verdict, results } of perConclusion) {
      const icon = verdict === 'falsified' ? `${RED}✗` : verdict === 'unmeasurable' ? `${YELLOW}?` : `${GREEN}✓`;
      console.log(`${icon}${RESET} ${BOLD}${c.id}${RESET}  ${c.claim}`);
      for (const r of results) {
        const mark = r.triggered ? `${RED}fired${RESET}` : r.verdict === 'unmeasurable' ? `${YELLOW}unmeasurable${RESET}` : `${GREEN}holds${RESET}`;
        console.log(`    ${mark.padEnd(10)} ${r.name} ${DIM}— ${r.detail}${RESET}`);
        if (r.triggered) console.log(`      ${DIM}why it matters: ${r.why}${RESET}`);
      }
      console.log();
    }

    const falsified = perConclusion.filter((p) => p.verdict === 'falsified');
    const unknownState = perConclusion.filter((p) => p.verdict === 'unmeasurable');
    const active = perConclusion.filter((p) => p.verdict === 'active');

    console.log(`${BOLD}合计${RESET}  ${active.length} active · ${falsified.length} falsified · ${unknownState.length} unmeasurable`);

    if (falsified.length > 0) {
      const message = [
        `证伪检查触发 ${falsified.length} 条结论`,
        ...falsified.map(({ c, results }) => {
          const why = results.filter((r) => r.triggered).map((r) => `${r.name}: ${r.detail}`).join('; ');
          return `${c.id} ${c.claim} — ${why}`;
        }),
        '',
        '这几条结论必须立即标为 superseded，而不是留在看板上。',
        '「效应弱」不是「无结论」。',
      ].join('\n');

      console.log();
      console.log(`  ${BOLD}这几条结论必须立即标为 superseded，而不是留在看板上。${RESET}`);
      console.log(`  ${DIM}「效应弱」不是「无结论」。${RESET}`);
      console.log();
      if (channel !== null) {
        const delivery = await notify(channel, message, dryRun);
        if (!delivery.sent) console.log(`${YELLOW}not delivered${RESET} — ${delivery.reason}`);
        else console.log(`${GREEN}delivered via ${channel}${RESET}`);
      }
      process.exitCode = 1;
    } else if (unknownState.length > 0) {
      console.log(`\n${YELLOW}无法判断${RESET} — ${unknownState.length} conclusion(s) had a condition that could not be evaluated.`);
      console.log(`  ${DIM}This is not a pass. A condition nobody could check is not a condition that held.${RESET}`);
      process.exitCode = 2;
    } else {
      console.log(`${GREEN}全部成立${RESET}`);
      process.exitCode = 0;
    }
    console.log();
  }
}
