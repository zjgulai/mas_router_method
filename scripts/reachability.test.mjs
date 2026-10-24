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
