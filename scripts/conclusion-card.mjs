#!/usr/bin/env node
/**
 * conclusion-card — is a conclusion card worth publishing at all?
 *
 * `verify-conclusion.mjs` answers a different question: *has this conclusion been
 * falsified yet*. It runs the condition functions and reports which fired. It says
 * nothing about whether the card should have been written — and a card whose claim is
 * 更好的表现 passes it clean, because a claim with no number in it has no falsification
 * condition to fail either.
 *
 * So this checks the six fields, and it checks the two that make the difference between
 * a conclusion and an opinion wearing a quantitative coat:
 *
 *   **主张 must contain a number and no adjectives.** "GMV 提升 1.7%" is a claim.
 *   "更好的表现" is a mood. The design's own words: 一句话，含量化，不用形容词.
 *
 *   **决策含义 must name an action, not a state of mind.** "更了解市场" changes nothing;
 *   "把预算从 B 挪到 A" does. A conclusion that changes no action has no reason to exist,
 *   and this is the field everyone fills with "有助于决策".
 *
 * The rest is mechanical but each field has one specific way of being fake, and those are
 * what the checks target: 范围 without a time window, 区间 given as a single number,
 * 依据 without a lineage pointer, 证伪条件 that cannot be executed.
 *
 * Usage:
 *   node scripts/conclusion-card.mjs check cards.json [--json]
 *   node scripts/conclusion-card.mjs --demo
 *
 * Input: { conclusions: [{ id, claim, scope, interval, basis, conditions, decision, status }] }
 *
 * Exit codes:
 *   0  every card is publishable
 *   1  at least one card is not
 *   2  the file cannot be judged (no cards, unreadable, malformed)
 */
import { readFile } from 'node:fs/promises';
import { CONDITIONS } from './conclusion-conditions.mjs';

const RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m',
      DIM = '\x1b[2m', BOLD = '\x1b[1m', RESET = '\x1b[0m';

/**
 * Adjectives and hedges that turn a claim into a mood.
 *
 * Not exhaustive and not meant to be — this catches the shape, and the shape is what a
 * person writes when they have not measured anything. A claim that survives this list
 * can still be vague in a way no list anticipates; the number requirement is the part
 * that does the real work.
 */
const HEDGES = [
  '更好', '更好一些', '较好', '不错', '有所提升', '有所改善', '显著提升', '明显改善',
  '更受', '更受欢迎', '表现不错', '表现良好', '效果不错', '效果显著', '很强', '较弱',
  '大概', '可能', '也许', '似乎', '看起来', '应该是', '倾向于', '相对来说',
];

/** Verbs that name an action a person can take tomorrow. */
const ACTION_VERBS = [
  '挪', '投', '增加', '减少', '砍', '停', '开', '改', '调', '切换', '保留', '放弃',
  '下架', '上架', '补货', '提价', '降价', '延期', '提前', '复制', '扩', '缩',
];

/** Phrases that fill 决策含义 without naming anything. */
const EMPTY_DECISIONS = [
  '有助于决策', '供参考', '为进一步分析提供', '更了解', '加深理解', '提高认识',
  '支持决策', '为决策提供依据', '有参考价值', '值得关注', '值得进一步',
];

/** A number, including percentages, decimals, and Chinese 万/亿 magnitudes. */
const HAS_NUMBER = /\d/;

/** Time-window words, so 范围 is not just a place name. */
const TIME_WORDS = [
  /周/, /月/, /年/, /季度/, /Q[1-4]/, /\d{4}/, /\d+\s*[-–~至]\s*\d+/, /窗口/, /期间/, /截至/,
];

function text(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/** Every problem on one card, as strings. */
export function checkCard(card) {
  const out = [];
  const id = text(card.id) === '' ? '(no id)' : card.id;
  const at = (field) => `${id}: 「${field}」`;

  // ── 主张 ──────────────────────────────────────────────────────────────────
  const claim = text(card.claim);
  if (claim === '') {
    out.push(`${at('主张')} is empty — a conclusion with no claim is a file`);
  } else {
    if (!HAS_NUMBER.test(claim)) {
      out.push(`${at('主张')} has no number — 一句话，含量化. "${claim.slice(0, 40)}" cannot be wrong, so it cannot be checked`);
    }
    const hedge = HEDGES.find((h) => claim.includes(h));
    if (hedge !== undefined) {
      out.push(`${at('主张')} contains the hedge "${hedge}" — 不用形容词. A hedge reads as a finding and carries no interval`);
    }
    if (claim.length < 8) {
      out.push(`${at('主张')} is ${claim.length} characters — too short to say what moves and by how much`);
    }
  }

  // ── 范围 ──────────────────────────────────────────────────────────────────
  const scope = text(card.scope);
  if (scope === '') {
    out.push(`${at('范围')} is empty — a claim about everywhere and always is a claim about nothing`);
  } else if (!TIME_WORDS.some((re) => re.test(scope))) {
    out.push(`${at('范围')} names no time window — "${scope.slice(0, 40)}". `
      + 'A region without a window cannot be re-checked later, because you cannot tell whether it still holds or you are looking at a different period');
  }

  // ── 区间 ──────────────────────────────────────────────────────────────────
  const interval = card.interval;
  if (interval === undefined || interval === null || interval === '') {
    out.push(`${at('区间')} is empty — 置信区间，不是点估计`);
  } else if (Array.isArray(interval)) {
    if (interval.length !== 2 || !interval.every((x) => Number.isFinite(x))) {
      out.push(`${at('区间')} must be [low, high] with two finite numbers`);
    } else if (interval[0] > interval[1]) {
      out.push(`${at('区间')} is backwards — [${interval[0]}, ${interval[1]}]`);
    }
  } else if (typeof interval === 'string') {
    // A single number with no pair is a point estimate wearing the field name.
    const nums = interval.match(/-?\d+(\.\d+)?/g) ?? [];
    if (nums.length < 2) {
      out.push(`${at('区间')} gives one number ("${interval.slice(0, 30)}") — a point estimate is not an interval, `
        + 'and the difference is what makes an effect falsifiable');
    }
  } else if (typeof interval === 'number') {
    out.push(`${at('区间')} is a single number (${interval}) — 置信区间，不是点估计`);
  }

  // ── 依据 ──────────────────────────────────────────────────────────────────
  const basis = card.basis;
  const basisText = Array.isArray(basis) ? basis.filter((b) => text(b) !== '').join(' ') : text(basis);
  if (basisText === '') {
    out.push(`${at('依据')} is empty — a conclusion with no lineage cannot be re-derived`);
  } else if (Array.isArray(basis) && basis.length === 0) {
    out.push(`${at('依据')} is an empty list`);
  } else if (!/版本|v\d|schema|taxonomy|metric|血缘|E-\d|T-\d|\.json|\.csv|\.md/.test(basisText)) {
    out.push(`${at('依据')} names no version or traceable artefact — "${basisText.slice(0, 40)}". `
      + 'Without one, 「依据」 is a link, not a path you can walk');
  }

  // ── 证伪条件 ──────────────────────────────────────────────────────────────
  const conditions = Array.isArray(card.conditions) ? card.conditions : [];
  if (conditions.length === 0) {
    out.push(`${at('证伪条件')} is empty — a conclusion that cannot be overturned is an opinion`);
  } else {
    for (const c of conditions) {
      if (typeof c !== 'string' || !(c in CONDITIONS)) {
        out.push(`${at('证伪条件')} names "${c}", which is not a registered condition — `
          + 'unregistered names evaluate to 无法判断, and 无法判断 is not a pass');
      }
    }
  }

  // ── 决策含义 ──────────────────────────────────────────────────────────────
  const decision = text(card.decision);
  if (decision === '') {
    out.push(`${at('决策含义')} is empty — a conclusion that changes no action has no reason to exist`);
  } else {
    const empty = EMPTY_DECISIONS.find((p) => decision.includes(p));
    if (empty !== undefined) {
      out.push(`${at('决策含义')} says "${empty}" — that is a state of mind, not an action. `
        + 'Name the thing someone does differently on Monday');
    }
    if (!ACTION_VERBS.some((v) => decision.includes(v))) {
      out.push(`${at('决策含义')} names no action verb — "${decision.slice(0, 40)}". `
        + `Expected one of: ${ACTION_VERBS.slice(0, 8).join(' / ')} …`);
    }
  }

  // ── status ────────────────────────────────────────────────────────────────
  const status = text(card.status);
  if (status !== '' && !['active', 'superseded'].includes(status)) {
    out.push(`${at('status')} is "${status}" — must be active or superseded. `
      + 'A conclusion with no way to be overturned cannot be trusted');
  }

  return out;
}

function demo() {
  return {
    conclusions: [
      {
        id: 'C1',
        claim: '控制促销与缺货后，声量每提升 10%，US 的 GMV 提升 1.7%（1.2–2.2）',
        scope: 'US · 2025 全年 52 周 · 母婴个护品类',
        interval: [0.012, 0.022],
        basis: ['A2+ v2', 'B1 v1', 'E-006'],
        conditions: ['ci-excludes-zero', 'regional-sign-consistent'],
        decision: '把 Q3 的社媒预算从 DE 挪 15% 到 US',
        status: 'active',
      },
      {
        id: 'C2',
        claim: '更好的表现',
        scope: '全部市场',
        interval: 0.017,
        basis: ['看了很多数据'],
        conditions: ['ci-excludes-zero'],
        decision: '有助于决策',
        status: 'active',
      },
      {
        id: 'C3',
        claim: '效应在第 3 周达峰（区间 2–4 周）',
        scope: 'DE · 2025 Q1–Q4',
        interval: [2, 4],
        basis: ['模型设定 v3'],
        conditions: ['lag-has-peak', 'sample-adequate'],
        decision: '把投放复盘的窗口从 1 周延长到 4 周',
        status: 'active',
      },
    ],
  };
}

const invokedDirectly = process.argv[1] !== undefined
  && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const target = argv.find((a) => !a.startsWith('--'));

  if (target === undefined && !argv.includes('--demo')) {
    console.error('usage: conclusion-card <cards.json> [--json] | --demo');
    process.exitCode = 2;
  } else {
    let doc = null;
    try {
      doc = argv.includes('--demo') ? demo() : JSON.parse(await readFile(target, 'utf8'));
    } catch (cause) {
      console.error(`${RED}cannot read cards${RESET} — ${cause.message}`);
      process.exitCode = 2;
    }

    if (doc !== null) {
      const cards = Array.isArray(doc.conclusions) ? doc.conclusions : [];
      if (cards.length === 0) {
        if (asJson) {
          console.log(JSON.stringify({ verdict: 'inconclusive', reason: 'no cards', cards: [] }, null, 2));
        } else {
          console.log(`${YELLOW}无法判断${RESET} — the file contains no conclusions. `
            + 'An empty card set is not a set of publishable conclusions.');
        }
        process.exitCode = 2;
      } else {
        const results = cards.map((c) => {
          const problems = checkCard(c);
          return { id: c.id ?? '(no id)', claim: c.claim ?? '', status: c.status ?? '', problems };
        });
        const bad = results.filter((r) => r.problems.length > 0);

        if (asJson) {
          console.log(JSON.stringify({
            verdict: bad.length === 0 ? 'passed' : 'failed',
            cards: results,
            total: results.length,
            unPublishable: bad.length,
          }, null, 2));
          process.exitCode = bad.length === 0 ? 0 : 1;
        } else {
          console.log(`\n${BOLD}结论卡${RESET} ${DIM}六项齐不齐，以及主张是不是一个能错的句子${RESET}\n`);
          for (const r of results) {
            const mark = r.problems.length === 0 ? `${GREEN}✓` : `${RED}✗`;
            console.log(`${mark}${RESET} ${BOLD}${r.id}${RESET}  ${r.claim.slice(0, 56)}`);
            for (const p of r.problems) console.log(`    ${RED}•${RESET} ${p}`);
            console.log();
          }
          if (bad.length === 0) {
            console.log(`${GREEN}通过${RESET} — ${results.length} card(s), all six fields answered\n`);
            process.exitCode = 0;
          } else {
            console.log(`${RED}${bad.length} of ${results.length} card(s) not publishable${RESET}\n`);
            process.exitCode = 1;
          }
        }
      }
    }
  }
}
