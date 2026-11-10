#!/usr/bin/env node
/**
 * flow-check — 阶段出口里能被机器判断的那部分。
 *
 * 为什么只做三个阶段：`native-agent-dev` 的六个出口里，clarify 和 tickets 的判据
 * 是「人同意了」，机器只能查文件在不在。查文件在不在是一种会给出假通过的检查——
 * 它证明有记录，不证明记录被同意过。所以那两个不做，宁缺。
 *
 * 三种退出码，沿用仓库既有约定：
 *   0  通过
 *   1  失败：产物在，但和声称的结论矛盾
 *   2  无法判断：产物根本不在，或证据比输入旧
 *
 * 2 不是失败。一个还没走到发布的阶段，不应该把构建打红；但它也不该报绿。
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './schema.mjs';

const GREEN = '\x1b[32m',
  RED = '\x1b[31m',
  YELLOW = '\x1b[33m',
  DIM = '\x1b[2m',
  RESET = '\x1b[0m';

// 测试要能指向一棵临时树，否则只能对着真实仓库跑——那种测试会在数据变化时
// 以"业务变了"的名义变红，而不是以"检查坏了"的名义。
const BASE = process.env.FLOW_ROOT ?? ROOT;
const CASES = join(BASE, 'packages/evals/src/cases/index.ts');
const RUNS = join(BASE, 'packages/evals/runs');
const RECEIPTS = join(BASE, 'work/receipts');

const read = (p) => readFile(p, 'utf8');

/** 用例总数：id 行是用例的唯一标记，缩进比字段深一层。 */
const countCases = (text) => (text.match(/^\s{2,}id: '/gm) ?? []).length;

/** spec：eval 集存在，且其中至少一条是确定性规则（有可判的评分标准）。 */
async function spec() {
  let text;
  try {
    text = await read(CASES);
  } catch {
    return { stage: 'spec', code: 2, why: `eval 用例文件不存在：${CASES}` };
  }
  const cases = countCases(text);
  const rules = (text.match(/kind: 'deterministic'/g) ?? []).length;
  if (cases === 0) return { stage: 'spec', code: 1, why: 'eval 文件在，但一条用例都没有' };
  if (rules === 0)
    return { stage: 'spec', code: 1, why: `${cases} 条用例，但没有一条确定性规则：分数只能靠人看` };
  return { stage: 'spec', code: 0, why: `${cases} 条用例，${rules} 条确定性规则` };
}

/** build：最近一次 eval 运行全部通过，且不早于用例文件。 */
async function build() {
  let files;
  try {
    files = (await readdir(RUNS)).filter((f) => f.endsWith('.json')).sort();
  } catch {
    return { stage: 'build', code: 2, why: `没有 runs 目录：${RUNS}` };
  }
  if (files.length === 0) return { stage: 'build', code: 2, why: 'runs 目录是空的：从没跑过 eval' };

  // 文件名是 ISO 时间戳，字典序即时间序。
  const latest = join(RUNS, files[files.length - 1]);
  const run = JSON.parse(await read(latest));

  // 证据比输入旧，就不是证据。用例改过之后没重跑，这条运行记录说明不了现在。
  try {
    const [c, r] = await Promise.all([stat(CASES), stat(latest)]);
    if (c.mtimeMs > r.mtimeMs) {
      return {
        stage: 'build',
        code: 2,
        why: `用例文件在 ${files[files.length - 1]} 之后改过：这次运行已过期，需要重跑`,
      };
    }
  } catch {
    return { stage: 'build', code: 2, why: '无法比较用例与运行记录的时间' };
  }

  const cases = run.cases ?? [];
  const failed = cases.filter((c) => c.passed === false).map((c) => c.caseId);
  const guard = (run.guardrailFailures ?? []).length;
  if (failed.length > 0)
    return {
      stage: 'build',
      code: 1,
      why: `最近一次运行有 ${failed.length} 条失败：${failed.join(', ')}`,
    };
  if (guard > 0)
    return { stage: 'build', code: 1, why: `最近一次运行有 ${guard} 条 guardrail 失败` };
  if (cases.length === 0) return { stage: 'build', code: 2, why: '最近一次运行里没有任何用例记录' };

  // 跑了一条也是"全部通过"。没跑的用例不会失败——这正是 try-one 这类局部运行
  // 最容易被当成全绿的地方。覆盖率不够，结论只能是"无法判断"。
  let total = 0;
  try {
    total = countCases(await read(CASES));
  } catch {
    total = 0;
  }
  if (total > 0 && cases.length < total) {
    return {
      stage: 'build',
      code: 2,
      why: `最近一次运行只覆盖 ${cases.length}/${total} 条用例：局部运行不能证明整体`,
    };
  }
  return {
    stage: 'build',
    code: 0,
    why: `最近一次运行 ${files[files.length - 1]}：${cases.length}/${total || cases.length} 条用例全部通过`,
  };
}

/** release：有回执，说明真的交付给谁了。没有回执不是错，是还没走到。 */
async function release() {
  let files;
  try {
    files = (await readdir(RECEIPTS)).filter((f) => /^REC-\d{3}-.*\.md$/.test(f));
  } catch {
    return { stage: 'release', code: 2, why: `没有回执目录：${RECEIPTS}` };
  }
  if (files.length === 0)
    return { stage: 'release', code: 2, why: '没有回执：还没有真实用户用过它，release 尚未发生' };
  return { stage: 'release', code: 0, why: `${files.length} 份回执：${files.sort().slice(-1)[0]}` };
}

const STAGES = { spec, build, release };
const args = process.argv.slice(2);
const want = args.includes('--stage') ? args[args.indexOf('--stage') + 1] : 'all';
if (want !== 'all' && !(want in STAGES)) {
  console.error(`未知阶段：${want}。可选：all, ${Object.keys(STAGES).join(', ')}`);
  process.exit(2);
}

const picked = want === 'all' ? Object.keys(STAGES) : [want];
const results = [];
for (const name of picked) results.push(await STAGES[name]());

const LABEL = {
  0: `${GREEN}通过${RESET}`,
  1: `${RED}失败${RESET}`,
  2: `${YELLOW}无法判断${RESET}`,
};
for (const r of results)
  console.log(`  ${LABEL[r.code]}  ${r.stage.padEnd(8)}  ${DIM}${r.why}${RESET}`);

// 全部通过才算 0；有失败就是 1；只有"无法判断"就是 2。
const code = results.some((r) => r.code === 1) ? 1 : results.every((r) => r.code === 0) ? 0 : 2;
console.log(`\n  ${DIM}exit ${code}：0 通过 / 1 失败 / 2 无法判断${RESET}`);
process.exit(code);
