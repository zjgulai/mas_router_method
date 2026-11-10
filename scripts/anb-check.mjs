#!/usr/bin/env node
/**
 * anb-check — 七个 anb 检查里，能被机器判的那部分。
 *
 * 不是把检查自动化。`offline`、`otherdevice`、`readback`、`output` 的结论只能由人下，
 * 机器替不了。这里只做两件确定性的事：
 *   1. 换两种方法数同一个东西，并把差异摆出来（count / reconcile）。
 *   2. 校验一份按固定格式写好的回报，看它自洽不自洽（report）。
 *
 * 第 2 件为什么重要：这七个检查存在的理由是「人看不出这个数错了」。
 * 如果连回报格式也要靠同一个人目测，那就是循环论证。
 *
 * 用法：
 *   node scripts/anb-check.mjs count <file> --pattern <regex>
 *   node scripts/anb-check.mjs reconcile --total <n> --parts <a,b,c>
 *   node scripts/anb-check.mjs report <file>
 *
 * 退出码：0 自洽 / 1 矛盾 / 2 无法判断（输入读不了，或格式认不出）
 */
import { readFile } from 'node:fs/promises';

const GREEN = '\x1b[32m',
  RED = '\x1b[31m',
  YELLOW = '\x1b[33m',
  DIM = '\x1b[2m',
  RESET = '\x1b[0m';

const flag = (args, name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

/** 两种数法：匹配的行数，与匹配的次数。它们经常会不相等。 */
async function count(args) {
  const file = args[0];
  const pattern = flag(args, '--pattern');
  if (!file || !pattern) return { code: 2, why: '需要 <file> 和 --pattern <regex>' };

  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return { code: 2, why: `读不到 ${file}` };
  }

  let lineRe, occRe;
  try {
    // 两种数法必须用**同一个**模式，只是数的东西不同：匹配的行，还是匹配的次数。
    // 都加 m，否则 ^ / $ 只在全文首尾生效，两种数法会在锚点上分歧——
    // 那是注释里说的"命令稍微用出契约"的另一种形状。
    lineRe = new RegExp(pattern, 'm');
    occRe = new RegExp(pattern, 'gm');
  } catch (e) {
    return { code: 2, why: `正则无效：${e.message}` };
  }

  const lines = text.split('\n');
  const a = lines.filter((l) => lineRe.test(l)).length;
  const b = (text.match(occRe) ?? []).length;
  const agree = a === b;

  console.log(`  Counting: ${DIM}matches of /${pattern}/ in ${file}${RESET}`);
  console.log(`  Method A: ${DIM}lines containing a match${RESET} = ${a}`);
  console.log(`  Method B: ${DIM}occurrences${RESET} = ${b}`);
  console.log(`  Agree: ${agree ? GREEN + 'yes' + RESET : RED + 'no' + RESET}`);
  if (!agree) {
    console.log(
      `\n  ${DIM}差 ${Math.abs(a - b)}。多匹配同行时会这样——先确认你要数的是行还是次数。${RESET}`,
    );
  }
  return { code: agree ? 0 : 1 };
}

/** 总数与分项之和。分项对不上总和时，错的一般是被引用的那个总数。 */
function reconcile(args) {
  const total = Number(flag(args, '--total'));
  const partsRaw = flag(args, '--parts');
  if (!Number.isFinite(total) || partsRaw === undefined)
    return { code: 2, why: '需要 --total <n> 与 --parts <a,b,c>' };

  const parts = partsRaw.split(',').map((s) => Number(s.trim()));
  if (parts.some((n) => !Number.isFinite(n)))
    return { code: 2, why: `--parts 里有非数字：${partsRaw}` };

  const sum = parts.reduce((x, y) => x + y, 0);
  const diff = total - sum;
  console.log(`  Total: ${total}`);
  console.log(`  Parts: ${parts.join(' + ')} = ${sum}`);
  console.log(
    `  Equal: ${diff === 0 ? GREEN + 'yes' + RESET : RED + 'no' + RESET}${diff === 0 ? '' : ` (差 ${diff})`}`,
  );
  return { code: diff === 0 ? 0 : 1 };
}

/**
 * 校验一份写好的回报。格式来自各 skill 的 "Report back in this shape"：
 *   Counting: <what>. Method A: <cmd> = <n>. Method B: <cmd> = <m>. Agree: <yes/no>.
 *   Total: <n>. Parts: <a> + <b> + <c> = <sum>. Equal: <yes/no>.
 */
async function report(args) {
  const file = args[0];
  if (!file) return { code: 2, why: '需要 <file>' };

  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return { code: 2, why: `读不到 ${file}` };
  }

  const problems = [];
  if (/Counting:/.test(text)) {
    const a = /Method A:[^=\n]*=\s*`?(\d+)`?/.exec(text);
    const b = /Method B:[^=\n]*=\s*`?(\d+)`?/.exec(text);
    const agree = /Agree:\s*`?(yes|no)`?/i.exec(text);
    if (!a || !b) problems.push('Method A / Method B 缺一个，或数字没写');
    if (!agree) problems.push('Agree 字段缺失（必须写 yes 或 no）');
    if (a && b && agree) {
      const want = a[1] === b[1] ? 'yes' : 'no';
      if (agree[1].toLowerCase() !== want) {
        problems.push(`Agree=${agree[1]}，但 A=${a[1]}、B=${b[1]}，按定义应为 ${want}`);
      }
    }
  } else if (/Total:/.test(text)) {
    const total = /Total:\s*`?(\d+)`?/.exec(text);
    const parts = /Parts:\s*`?([\d\s+]+)`?=\s*`?(\d+)`?/.exec(text);
    const equal = /Equal:\s*`?(yes|no)`?/i.exec(text);
    if (!total) problems.push('Total 缺少数值');
    if (!parts) problems.push('Parts 必须写成 a + b + c = sum');
    if (!equal) problems.push('Equal 字段缺失');
    if (total && parts) {
      const sum = parts[1]
        .split('+')
        .map((s) => Number(s.trim()))
        .reduce((x, y) => x + y, 0);
      if (sum !== Number(parts[2]))
        problems.push(`分项相加是 ${sum}，但等号右边写的是 ${parts[2]}`);
      if (sum !== Number(total[1])) problems.push(`分项相加是 ${sum}，Total 写的是 ${total[1]}`);
      if (equal) {
        const want = sum === Number(total[1]) ? 'yes' : 'no';
        if (equal[1].toLowerCase() !== want)
          problems.push(`Equal=${equal[1]}，但两数${want === 'yes' ? '相等' : '不等'}`);
      }
    }
  } else {
    return { code: 2, why: '认不出回报类型：既没有 Counting: 也没有 Total:' };
  }

  if (problems.length === 0) {
    console.log(`  ${GREEN}ok${RESET} — 回报自洽（${file}）`);
    return { code: 0 };
  }
  console.log(`  ${RED}${problems.length} 处不自洽${RESET}`);
  for (const p of problems) console.log(`    ${RED}•${RESET} ${p}`);
  return { code: 1 };
}

const [cmd, ...rest] = process.argv.slice(2);
const COMMANDS = { count, reconcile, report };
if (!(cmd in COMMANDS)) {
  console.error(
    '用法：node scripts/anb-check.mjs count <file> --pattern <re> | reconcile --total <n> --parts <a,b,c> | report <file>',
  );
  process.exit(2);
}
const { code, why } = await COMMANDS[cmd](rest);
if (why) console.log(`  ${YELLOW}${why}${RESET}`);
console.log(`\n  ${DIM}exit ${code}${RESET}`);
process.exit(code);
