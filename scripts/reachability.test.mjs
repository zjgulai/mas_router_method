#!/usr/bin/env node
/**
 * Tests that every module of the method is reachable, and stays reachable.
 *
 * The audit found the management layer was reachable from nowhere a lost user
 * would look: `anb/SKILL.md` did not mention `anb-manage` at all, and neither did
 * the branch table. It appeared only in the site's top navigation — so someone who
 * entered through the router, which is the documented entry point, could not get
 * there. It was found by grepping once. Grepping once is how it will be lost again.
 *
 * The invariant: the eight modules of this method — seven stages and the
 * management layer — are each reachable from each entry point.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSchema, WORK } from './schema.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const read = (rel) => readFile(join(ROOT, rel), 'utf8');

test('the router names every stage skill and the management skill', async () => {
  const { stages } = await loadSchema();
  const router = await read('.claude/skills/anb/SKILL.md');

  for (const stage of stages) {
    assert.ok(
      router.includes(stage.skill),
      `the router never names ${stage.skill}, so the ${stage.label} stage is unreachable from the entry point`,
    );
  }
  assert.ok(
    router.includes('anb-manage'),
    'the router never names anb-manage — the management layer becomes unreachable from the '
    + 'documented entry point, which is exactly how it was lost the first time',
  );
});

test('the site: every stage page and the management page is linked from the two index-ish pages', async () => {
  const { stages } = await loadSchema();
  const required = [...stages.map((s) => `${s.id}.html`), 'manage.html'];

  for (const page of ['index.html', 'branches.html']) {
    const html = await read(`docs/site/${page}`);
    for (const target of required) {
      assert.ok(
        html.includes(`/mas_router_method/site/${target}`),
        `docs/site/${page} does not link to ${target}`,
      );
    }
  }
});

test('the nav bar reaches management from every generated page', async () => {
  const { readdir } = await import('node:fs/promises');
  const pages = (await readdir(join(ROOT, 'docs/site')))
    .filter((f) => f.endsWith('.html'));

  assert.ok(pages.length >= 13, `expected the generated pages, found ${pages.length}`);
  for (const page of pages) {
    const html = await read(`docs/site/${page}`);
    // 顶部导航在每一页都有，所以管理在任何一页都只需一次点击。
    assert.ok(
      html.includes('href="/mas_router_method/site/manage.html"'),
      `docs/site/${page} has no link to the management page`,
    );
  }
});

test('every stage says which register it writes to, and that register exists', async () => {
  // 管理不是第八个阶段，而是每一步的一部分。这条断言让「每一步都落记录」成为
  // 结构上的事实而不是意图：阶段技能里必须写出它写哪个寄存器，而那个目录必须存在。
  const { stages } = await loadSchema();
  const { readdir } = await import('node:fs/promises');

  for (const stage of stages) {
    const text = await read(`.claude/skills/${stage.skill}/SKILL.md`);
    const section = text.split('## What you record')[1];
    assert.ok(
      section !== undefined,
      `${stage.skill} has no "What you record" section — the ${stage.label} stage leaves nothing behind`,
    );
    assert.ok(
      section.includes('## Exit test'),
      `${stage.skill}: the "What you record" section runs into the exit test, so it is not its own section`,
    );

    const dirs = [...section.matchAll(/`work\/([a-z]+)\//g)].map((m) => m[1]);
    assert.ok(
      dirs.length > 0,
      `${stage.skill} names no register directory — "write it down" without a destination is not an instruction`,
    );
    for (const dir of new Set(dirs)) {
      const exists = (await readdir(join(WORK, dir)).catch(() => null)) !== null;
      assert.ok(exists, `${stage.skill} points at work/${dir}/, which does not exist`);
    }
  }
});

test('the stages that consume a design record actually say to read it', async () => {
  // 审计里最要紧的一条断裂：设计阶段的 exit test 承诺「拒绝清单每一行都能写成一条
  // 会变红的检查」，正文也说「验收阶段会把它变成检查」——而接收端提及设计记录 0 次。
  // 承诺没有接收方时，记录是文档，不是规格。这条断言让接收方成为结构的一部分。
  const design = await read('.claude/skills/anb-design/SKILL.md');
  assert.match(
    design,
    /design\.mjs/,
    'the design stage must name who reads the record, or the promise still has no receiving end',
  );

  const judgeable = await read('.claude/skills/anb-judgeable/SKILL.md');
  assert.match(
    judgeable,
    /design\.mjs refusals/,
    'the verify stage must read the refusal list — its guardrail checks come from there',
  );
  // 三种结果必须被区分开：有行、显式跳过、没有记录。混为一谈就是假通过。
  assert.match(judgeable, /跳过/, 'the verify stage must handle an explicitly skipped refusal list');
  assert.match(judgeable, /Exit code 3|退出码 3/, 'the verify stage must handle "no design record" without skipping silently');

  const runnable = await read('.claude/skills/anb-runnable/SKILL.md');
  assert.match(
    runnable,
    /design\.mjs constraints/,
    'the build stage must read the judgement points and action permissions before writing code',
  );
});

test('the iterate stage closes the loop from observation back into a register', async () => {
  // 站点的迭代页一直画着「有了真实使用数据 → 回到需求」这条分支，而技能只讲模板抽取、
  // 观测数字提及 0 次——同一阶段两处说法不一致，而技能才是 agent 真正执行的东西。
  // 「自进化闭环」如果不落在寄存器里，就只是这一页上的一句话。
  const reusable = await read('.claude/skills/anb-reusable/SKILL.md');

  assert.match(reusable, /## What to change/, 'the iterate stage must act on what the observation said, not only on what to keep');
  assert.match(reusable, /ran|cost|failed/i, 'the loop starts from the operate stage\'s three numbers');
  assert.match(reusable, /work\/requirements\//, 'a changed need goes back as a requirement, or the loop is not closed');
  assert.match(reusable, /work\/tickets\//, 'committed work goes back as a ticket, or the conclusion stays in the conversation');

  // 站点与技能必须说同一件事，否则站点描述的是一个不存在的流程。
  const site = await read('docs/site/iterate.html');
  assert.match(site, /work\/requirements\//, 'the iterate page must name the same destination as the skill');
});
