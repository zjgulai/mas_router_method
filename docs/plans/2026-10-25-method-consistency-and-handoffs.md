# ANB 方法一致性与交接修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让七阶段 + 管理这套方法内部一致（阶段顺序只有一个来源）且彼此连通（每一阶段的产出被需要它的阶段读取），使不写代码的人不会被给出反向指令，也不会有「写了没人读」的产物。

**Architecture:** 阶段顺序变成 `work/schema.yml` 里的数据，`scripts/schema.mjs` 是它唯一的读者；skill 只写阶段名、不写编号，由校验器保证（prose 会漂移，已经漂移过两次）；站点生成器收回仓库并登记为产物，使站点可重建；新增 `scripts/design.mjs` 把已确认的设计记录变成下游可消费的形式。

**Tech Stack:** Node 22 ESM（`node --test`）、Python 3（站点生成器，隔离在 `scripts/site/`）、GitHub Actions、GitHub Pages（branch `/docs`）。

**Spec:** `docs/product/method-audit-2026-10-25.md`

## Global Constraints

- Node 22（CI 固定 `node-version: '22'`）；工具脚本一律 `scripts/*.mjs`，ESM。
- 站点必须留在 `docs/site/` 下：Pages 用 legacy build_type，只能发布仓库根或 `/docs`。
- 提交只能在 `/tmp` 的 `git clone` 副本里做；复制用 `cp -a`，**绝不用 `tar`**（INC-001）。
- 仓库是公开的：凭据永不入 commit；凭据文件在 `<repo>/.git/github-credentials`，
  沙箱内路径为 `/sessions/<session>/mnt/mas_router_method/.git/github-credentials`。
- 文档里每一个引用的数字都必须由 `scripts/facts.mjs` 从磁盘推导，且 `--check` 通过。
- 每一类信息只有一个家（`work/LAYOUT.md`）；重复定义视为 bug。
- 判断「会变 → `work/`，不会变 → `docs/`」决定新文件的归属。
- 每个任务结束跑：`node scripts/work.mjs check && node scripts/layout.mjs && node scripts/facts.mjs --check`。

## Review Focus

以下五类输入/条件，规格暗示但没有任何任务的测试覆盖，最可能在使用中咬人（最可能的在前）：

1. **有人往 skill 里重新写回 `Stage 3`** —— 校验器必须变红，不能靠人记得；这件事已经错过两次。
2. **已确认的设计记录存在，但拒绝清单被显式标记为跳过** —— 读取器必须报出「跳过及理由」，不得返回空列表；空列表会被读成「没有要拒绝的」，而那是相反的意思。
3. **存在两条以上已确认的设计记录** —— 读取器必须确定性地选一条并说明选了哪条，不得依赖目录顺序。
4. **某阶段的寄存器为空或目录不存在**（`requirements` / `receipts` / `artifacts` 目前都是空）—— 该阶段的「这一步要记什么」指令仍须可执行，不得报错或静默跳过。
5. **重新生成站点时 `docs/site/` 根目录出现生成器不产出的 html**（手写残留或孤儿）—— 必须报出该文件，而不是留着腐烂。

每条在接受它的任务里都有对应测试或验证步骤。

---

### Task 1: 把站点生成器收回仓库，手写原件与生成物分家

**Files:**
- Create: `scripts/site/build_shell.py`、`build_pages.py`、`build_prompts.py`、`build_skills.py`、`build_docs.py`、`build_manage.py`、`map.py`（从临时目录迁入，路径改写）
- Create: `scripts/site/build.mjs`（唯一入口）
- Create: `work/artifacts/active/ART-001-site-build.md`
- Create: `docs/site/originals/`（移入 8 份手写原件）
- Modify: `work/LAYOUT.md`（新增 `scripts/site/`、`docs/plans/`、`docs/site/originals/` 三行）
- Modify: `scripts/layout.mjs:52-64`（站点规则接受 `docs/site/originals/*.html`）
- Modify: `.github/workflows/check.yml`
- Move: `docs/site/{failure-atlas,decision-tree,terms,capability-map,anb-proposal,atlas-test-report,anb2-report,anb2-full}.html` → `docs/site/originals/`

**Interfaces:**
- Produces: `node scripts/site/build.mjs` —— 从仓库内的生成器重建 `docs/site/` 全部生成物；
  若根目录存在生成器不产出的 `.html`，列出并以退出码 1 结束；
  成功时退出 0 并打印生成的页数。所有下游任务改站点后都跑它。

- [ ] **Step 1: 迁入生成器并改写路径假设**

把 6 个 `build_*.py` 与 `map.py` 从 `/sessions/<session>/mnt/outputs/site-build/`
复制到 `scripts/site/`。逐个改写三处假设：

- `sys.path.insert(0, '.')` → `sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))`
- 仓库根从 `'../../mas_router_method'` 改为 `REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))`
- 输出 `out/` → `os.path.join(REPO, 'docs/site')`

`build_docs.py` 同时删除向 `out/docs/` 复制原件的整段逻辑（`out/docs/` 是废弃暂存，
`docs.html` 实际链接的是扁平路径），并把 `DOCS` 里的链接改为 `/mas_router_method/site/originals/{fn}`。

- [ ] **Step 2: 移入手写原件**

```bash
cd docs/site && mkdir -p originals
git mv failure-atlas.html decision-tree.html terms.html capability-map.html \
       anb-proposal.html atlas-test-report.html anb2-report.html anb2-full.html originals/
```

- [ ] **Step 3: 写入口 `scripts/site/build.mjs`**

先让生成器输出到暂存目录，再同步到 `docs/site/`。
**不要手工维护「生成了哪些文件」的清单**——那份清单本身就是会过时的一处。

```js
// 1. mkdtemp 建暂存目录，把 STAGE_DIR 环境变量指过去，依次跑 6 个生成器
// 2. 暂存目录根下的 .html 集合 = 本次生成物（文件名即清单，无需手写）
// 3. docs/site/ 根下的 .html 减去该集合，非空即为孤儿 -> 逐个打印，退出 1
// 4. 无孤儿时，把暂存目录根下的文件同步进 docs/site/
//    （originals/ 是子目录，不参与同步，也不参与孤儿判定）
```

退出码：孤儿存在为 1；生成器自身失败为非 0 并原样透传其输出；成功为 0 且打印页数。

- [ ] **Step 4: 更新 `scripts/layout.mjs` 的站点规则**

`docs/site/` 现在同时容纳生成物（根）与手写原件（`originals/`）。把站点页面规则改为：

```js
match: (p) => /^docs\/site\/(originals\/)?[^/]+\.html$/.test(p),
```

- [ ] **Step 5: 登记为产物**

创建 `work/artifacts/active/ART-001-site-build.md`，frontmatter 含
`id: ART-001`、`owner: lute`、`delete_when:` 一句可判定的条件
（例如「站点改为 Actions 部署且 `docs/site/` 移出仓库时」）。`work check` 要求
owner 与 delete_when 都非空，否则失败。

- [ ] **Step 6: 跑一次，证明生成器就是源码**

Run:
```bash
node scripts/site/build.mjs && git diff --exit-code docs/site/
```
Expected: 退出码 0，diff 为空 —— 生成器的输出与仓库中已提交的 21 页逐字节一致。
**若 diff 非空，先看差异再继续**：那说明已提交的页面与生成器已经漂移，
差异本身就是这次要修的 bug。

- [ ] **Step 7: CI 加一步重建校验**

在 `.github/workflows/check.yml` 增加 `actions/setup-python@v5` 与一步
`name: The site rebuilds from its generators` / `run: node scripts/site/build.mjs && git diff --exit-code docs/site/`。

- [ ] **Step 8: 提交**

```bash
git add scripts/site work/artifacts work/LAYOUT.md scripts/layout.mjs .github/workflows/check.yml docs/site
git commit -m "build(site): bring the site generators into the repo and register them"
```

---

### Task 2: 阶段顺序的单一来源 + 命名校验器

**Files:**
- Modify: `work/schema.yml`（新增 `stage_order` / `stage_labels` / `stage_skills`）
- Modify: `scripts/schema.mjs`（导出 `stages`；新增 CLI）
- Create: `scripts/naming.mjs`
- Create: `scripts/naming.test.mjs`
- Modify: `.github/workflows/check.yml`

**Interfaces:**
- Produces:
  - `loadSchema()` 返回值新增四项，命名固定：
    `stageOrder: string[]`、`stageLabels: Record<string,string>`、
    `stageSkills: Record<string,string>`、`stageEntities`（已存在），
    以及 `stages: { id: string; label: string; skill: string; oneline: string; index: number }[]`
    （按 `stageOrder` 顺序，`index` 从 1 起）
  - `node scripts/schema.mjs stages --json` 输出上述数组的 JSON（Task 3 的 Python 生成器靠它，避免出现第二个 YAML 解析器）
  - `node scripts/naming.mjs check` —— 无硬编码阶段编号时退出 0，否则列出文件:行:片段并退出 1
  - `findStageNumbers(text: string): { line: number; snippet: string }[]`（导出供测试）
- Consumes: 无

- [ ] **Step 1: 写失败测试**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findStageNumbers } from './naming.mjs';

test('findStageNumbers catches every shape the drift has taken', () => {
  const text = ['# Stage 3 — It can be judged', 'before stage 4 (shipping)', 'ANB 阶段 2 覆盖这一步'].join('\n');
  assert.deepEqual(findStageNumbers(text).map((h) => h.line), [1, 2, 3]);
});

test('findStageNumbers ignores the word stage used as a normal noun', () => {
  assert.deepEqual(findStageNumbers('This is a later stage of the work.'), []);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test scripts/naming.test.mjs`
Expected: FAIL — `findStageNumbers` is not a function

- [ ] **Step 3: 实现 `scripts/naming.mjs`**

匹配 `/\b[Ss]tage\s+\d/` 与 `/ANB\s*阶段\s*\d/`，但**不匹配** `stage` 后跟非数字。

`check` 扫描两处，命中即失败并打印 `文件:行号: 片段`：

- `.claude/skills/anb*/SKILL.md`
- `docs/site/*.html` —— **仅根目录**。`docs/site/originals/` 是冻结的历史原件
  （站点明示「未改一字」），它们里面有阶段编号是正常的，必须排除在外。

不加逃生口（如注释豁免）。需要豁免说明规则本身有问题，那时再加，现在加只是给校验开洞。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test scripts/naming.test.mjs`
Expected: PASS（2 个测试）

- [ ] **Step 5: 在 `work/schema.yml` 加单一来源**

```yaml
# 阶段顺序的唯一来源。站点、skill 校验、stage_entities 都从这里读。
# 编号不写在这里——编号由位置在构建时派生，写下来就会过时。
stage_order: [need, design, build, verify, ship, operate, iterate]
stage_oneline:
  need: 把一句话想法变成可验收的意图
  design: 定契约、边界、数据与决策记录
  build: 一条真实输入走通，且不是假的
  verify: 什么算好，而且检查必须能失败
  ship: 别人能打开、能用，不需要你在旁边
  operate: 看得出它有没有被用、有没有变好
  iterate: 只留下真的用过的，改掉真的错的
stage_labels:
  need: 需求
  design: 设计
  build: 开发
  verify: 验收
  ship: 交付
  operate: 运营
  iterate: 迭代
stage_skills:
  need: anb-idea
  design: anb-design
  build: anb-runnable
  verify: anb-judgeable
  ship: anb-shipable
  operate: anb-observable
  iterate: anb-reusable
```

- [ ] **Step 6: `scripts/schema.mjs` 导出 stages 并加 CLI**

`loadSchema()` 组装 `stages`；文件末尾加 CLI：
`node scripts/schema.mjs stages --json` 打印 `JSON.stringify(stages)` 后退出。

- [ ] **Step 7: 加一致性测试**

```js
test('live schema: the four stage key sets are identical', async () => {
  const s = await loadSchema();
  const order = s.stageOrder;                    // ['need', ...]
  const keys = (o) => Object.keys(o).sort();
  assert.deepEqual(keys(s.stageLabels), order.slice().sort());
  assert.deepEqual(keys(s.stageSkills), order.slice().sort());
  assert.deepEqual(keys(s.stageEntities), order.slice().sort());
});

test('live schema: every stage names a skill that exists', async () => {
  const s = await loadSchema();
  const { readdir } = await import('node:fs/promises');
  const dirs = await readdir('.claude/skills');
  for (const st of s.stages) assert.ok(dirs.includes(st.skill), `${st.id} -> ${st.skill} missing`);
});
```

- [ ] **Step 8: 探针测试——校验器必须变红**

写一个探针 skill 文件（含 `Stage 3`），跑 `node scripts/naming.mjs check`，
断言退出码 1 且输出含该文件名与行号；然后删除探针。
（照 `scripts/work.test.mjs` 中 D-998 探针的写法。）

- [ ] **Step 9: CI 加一步，并放宽测试步骤的匹配**

`run: node scripts/naming.mjs check`，命名 `name: Skills name stages, they do not number them`。
把测试步骤改为 `run: node --test scripts/*.test.mjs`。

- [ ] **Step 10: 提交**

```bash
git add work/schema.yml scripts/schema.mjs scripts/naming.mjs scripts/naming.test.mjs .github/workflows/check.yml
git commit -m "feat(schema): give the stage order one home and forbid hardcoded stage numbers"
```

---

### Task 3: 站点与原始文档从单一来源重建，阶段页文件名为无编号 slug

**Files:**
- Modify: `scripts/site/build_shell.py`（`STAGES` 改为从 CLI 读；slug 用 stage id）
- Modify: `scripts/site/build_pages.py`（`DETAIL` 的 key 改用 stage id；gapnote 去掉编号）
- Modify: `scripts/site/build_skills.py`、`build_docs.py`、`build_manage.py`（链接路径）
- Modify: `scripts/facts.mjs:39-47`（`stagePages()` 改为从 schema 派生）
- Create: `scripts/site/links.mjs`
- Delete: `docs/site/{01-need,02-design,03-build,04-verify,05-ship,06-operate,07-iterate}.html`
- Create: `docs/site/{need,design,build,verify,ship,operate,iterate}.html`
- Modify: `.github/workflows/check.yml`

**Interfaces:**
- Consumes: `node scripts/schema.mjs stages --json`（Task 2）、`node scripts/site/build.mjs`（Task 1）
- Produces: `node scripts/site/links.mjs` —— 校验全部站内链接与锚点，有断链则列出并退出 1

- [ ] **Step 1: 让 Python 生成器读单一来源**

`build_shell.py` 顶部替换硬编码的 `STAGES`：

```python
import json, subprocess, os
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_stages = json.loads(subprocess.run(
    ['node', os.path.join(REPO, 'scripts', 'schema.mjs'), 'stages', '--json'],
    capture_output=True, text=True, check=True).stdout)
# (slug, 中文名, 一句话) —— slug 就是 stage id，不含编号
STAGES = [(s['id'], s['label'], s['oneline']) for s in _stages]
```

`oneline` 同样来自 schema（`stage_oneline`）——它是某一阶段的说明，属于阶段元数据，
放在单一来源里，生成器侧不留第二份。

- [ ] **Step 2: 显示编号改为位置派生**

页面标题的 `num` 与导航里的编号改为 `f'{idx+1:02d}'`（`idx` 来自 `STAGES` 的位置）。
**任何地方都不再手写阶段数字。**

- [ ] **Step 3: 改掉 gapnote 里的旧编号**

`build_pages.py` 的 `DETAIL` 里，把 `ANB 阶段 N 覆盖这一步` 改为按名字表述，
例如 04-verify 的 gapnote 改为
`验收这一步由 <code>anb-judgeable</code> 覆盖，而且它是整条链路里唯一的硬门。`

同时 `DETAIL` 的 key 从 `'04-verify'` 改为 `'verify'`（依此类推），并更新 `index_page()` 与
`branches.html` 生成处的引用。

- [ ] **Step 4: 重新生成并删掉带编号的旧页**

```bash
node scripts/site/build.mjs
git rm docs/site/0*-*.html
```

Expected: 7 个新 slug 页面生成；旧的 7 个带编号页面被删除。
`docs/index.html` 的跳转不变（指向 `/site/`），入口不受影响。
**注意**：旧 URL（`/site/02-design.html`）会失效。这是刻意的取舍——
编号是唯一必然过时的东西，放进 URL 就会在重排阶段时变成死链。

- [ ] **Step 5: 修 `facts.mjs` 的 stagePages()**

它现在按 `^0\d-.+\.html$` 数阶段页，改完文件名后会静默返回 0 —— 一个「安静变错」的数字，
正是 `facts` 存在的理由。改为直接取 `schema.stages.length`。

- [ ] **Step 6: 写 `scripts/site/links.mjs`**

扫描 `docs/site/**/*.html`：收集每页的 `id="…"`；校验同页 `#anchor`、
跨页 `/mas_router_method/site/<page>(#anchor)?`、以及 `originals/` 下的路径。
断链打印 `文件 -> 目标` 并退出 1。

- [ ] **Step 7: 验证重建与链接**

Run:
```bash
node scripts/site/build.mjs
node scripts/site/links.mjs
node scripts/naming.mjs check
node scripts/facts.mjs --check
node scripts/layout.mjs
```
Expected: 生成成功；断链 0；无硬编码编号；数字匹配；文件各就各位。

- [ ] **Step 8: CI 加链接校验步骤**

`name: The site's internal links resolve` / `run: node scripts/site/links.mjs`。

- [ ] **Step 9: 提交**

```bash
git add -A docs/site scripts .github/workflows/check.yml
git commit -m "fix(site): derive stage pages from the single source and drop numbers from filenames"
```

---

### Task 4: 全部 skill 去掉硬编码阶段编号

**Files:**
- Modify: `.claude/skills/anb/SKILL.md`、`anb-idea`、`anb-design`、`anb-runnable`、`anb-judgeable`、`anb-shipable`、`anb-observable`、`anb-reusable`（8 个阶段技能）
- Modify: `.claude/skills/anb-check-break`、`anb-check-offline`、`anb-check-otherdevice`、`anb-check-output`、`anb-check-readback`（5 个检查）

**Interfaces:**
- Consumes: `node scripts/naming.mjs check`（Task 2）
- Produces: 无（纯 prose 修改）

**旧编号到阶段名的映射（旧编号来自六阶段版本，实现时照此表替换，不要自己推断）：**

| 旧表述 | 语义 | 新表述 |
|---|---|---|
| stage 1 / Stage 1 | 想法 | the need stage |
| stage 2 / Stage 2 | 能跑 | the build stage |
| stage 3 / Stage 3 | 能判断 | the verify stage |
| stage 4 / Stage 4 | 能交付 | the ship stage |
| stage 5 / Stage 5 | 能观测 | the operate stage |
| stage 6 / Stage 6 | 能复用 | the iterate stage |

- [ ] **Step 1: 改 8 个阶段技能的 H1 与 frontmatter**

H1 去掉编号：`# Stage 2 — It runs` → `# It runs`。
frontmatter 的 `description:` 首句改为 `Stage: build (开发). ` 的形式
（每个技能用自己对应的 id 与中文名）。

- [ ] **Step 2: 改正文交叉引用**

按上表逐处替换。三处需要特别小心，因为它们现在是**反向指令**：

- `anb/SKILL.md`：`Never proceed past stage 3 without evidence…` → `Never proceed past the verify stage without evidence…`
- `anb/SKILL.md`：`Stage 3 is the only gate… do not build stage 4.` → `The verify stage is the only gate… do not start the ship stage.`
- `anb-check-break`：`Mandatory before stage 3 can be called finished.` → `Mandatory before the verify stage can be called finished.`

- [ ] **Step 3: 修 `anb-design` 正文——它自称新编号却用旧编号引用**

`anb-design` 标题写 `Stage 2`（新编号），正文却写 `stage 3 turns it into checks`
（旧编号，实指验收）。把正文的 `stage 3` 全部改为 `the verify stage`，
把 `stage 2 and stage 3 overlap` 改为 `the design and verify stages overlap`。

- [ ] **Step 4: 跑校验器**

Run: `node scripts/naming.mjs check`
Expected: 退出 0，无输出。任一处漏改都会在这里变红。

- [ ] **Step 5: 提交**

```bash
git add .claude/skills
git commit -m "fix(anb): name the stages instead of numbering them"
```

---

### Task 5: 路由表与分支总表接入管理模块

**Files:**
- Modify: `.claude/skills/anb/SKILL.md`（Route 表 + 一句说明）
- Modify: `scripts/site/build_skills.py`（`branches_page()` 加管理分支）
- Modify: `scripts/site/build_pages.py`（`index_page()` 加管理入口卡）

**Interfaces:**
- Consumes: `node scripts/site/build.mjs`（Task 1）
- Produces: 无

**说明**：`docs/site/originals/decision-tree.html` 是冻结的原始文档
（站点明示「未改一字」），**不改它**。要修的是活的导航面：router、分支总表、首页入口。

- [ ] **Step 1: router 加管理**

在 `anb/SKILL.md` 的 Route 表末尾加一行：

```
| "如何管理这个项目的记录 / 这张票能关了吗 / 记一下这件事" | `anb-manage` |
```

并在表下补一句说明管理不是第八个阶段，而是横跨：票据在 need 时开，证据在 verify 时落，
事故可能发生在任何一刻。

- [ ] **Step 2: 分支总表加管理分支**

`branches_page()` 里加入一条管理分支，与七阶段并列，说明「任何阶段都可以记笔记录」。

- [ ] **Step 3: 首页加管理入口**

`index_page()` 在「从这里进」的四张卡里补第五张：管理（横跨七阶段的记录层）。

- [ ] **Step 4: 重建并验证**

Run:
```bash
node scripts/site/build.mjs && node scripts/site/links.mjs && node scripts/naming.mjs check
```
Expected: 断链 0；无硬编码编号。

- [ ] **Step 5: 提交**

```bash
git add .claude/skills/anb docs/site scripts/site
git commit -m "fix(anb): make the management layer reachable from the router and the branch table"
```

---

### Task 6: 七个阶段技能各加「这一步要记什么」

**Files:**
- Modify: `.claude/skills/anb-idea`、`anb-design`、`anb-runnable`、`anb-judgeable`、`anb-shipable`、`anb-observable`、`anb-reusable`

**Interfaces:**
- Consumes: 各寄存器的目录与 ID 前缀，来自 `work/schema.yml`
- Produces: 无

**阶段到寄存器的映射（实现时照此，不要自创）：**

| 阶段 | 写入 | ID |
|---|---|---|
| need | `work/requirements/<state>/` | `R-` |
| design | `work/designs/<state>/` | `D-` |
| build | `work/tickets/<state>/` | `T-` |
| verify | `work/evidence/` | `E-` |
| ship | `work/receipts/` | `REC-` |
| operate | `work/artifacts/` 与 `work/incidents/<state>/` | `ART-` / `INC-` |
| iterate | `work/requirements/` 或 `work/tickets/`（本轮的结论） | `R-` / `T-` |

- [ ] **Step 1: 在每个阶段技能末尾、Exit test 之前，插入 `## What you record`**

内容三行以内：这一步的产出落到哪个寄存器、ID 前缀是什么、
以及一句判据（只在跨会话或有持续成本时才记，一次性完成的不记）。
用该技能既有的英文语气，与其它小节风格一致。

- [ ] **Step 2: 验证空寄存器不会让指令失效**

三个空寄存器逐个验一遍，证明「这一步要记什么」的指令在空目录上真的可执行。
先记下当前条数，探针写入后核对，最后删除并确认回到原值。

```bash
node scripts/work.mjs status | grep -E "需求|产物|回执"     # 记下探针前的条数

mkdir -p work/requirements/drafting work/artifacts/active
cat > work/requirements/drafting/R-001-probe.md <<'EOF'
---
id: R-001
title: probe
stage: need
---
probe
EOF
cat > work/artifacts/active/ART-099-probe.md <<'EOF'
---
id: ART-099
title: probe
owner: probe
delete_when: 探针验证完即删
---
probe
EOF
cat > work/receipts/REC-001-probe.md <<'EOF'
---
id: REC-001
title: probe
---
probe
EOF

node scripts/work.mjs check     # 期望：退出 0，识别到 R-001 / ART-099 / REC-001
node scripts/work.mjs status    # 期望：三个寄存器各显示 1 条，不报错

rm work/requirements/drafting/R-001-probe.md work/artifacts/active/ART-099-probe.md work/receipts/REC-001-probe.md
node scripts/work.mjs status | grep -E "需求|产物|回执"     # 期望：回到探针前的条数
```

Expected: `check` 退出 0；`status` 三次都不报错；删除后条数回到原值。
（`receipts` 是 append-only 寄存器，没有状态目录，直接放在 `work/receipts/` 下。）

- [ ] **Step 3: 提交**

```bash
git add .claude/skills
git commit -m "feat(anb): tell every stage which register it writes to"
```

---

### Task 7: `scripts/design.mjs` —— 把设计记录变成下游能消费的形式

**Files:**
- Create: `scripts/markdown.mjs`
- Modify: `scripts/work.mjs`（删除本地的 `sections()`，改为 import）
- Create: `scripts/design.mjs`
- Create: `scripts/design.test.mjs`

**Interfaces:**
- Produces:
  - `sections(text: string): { head: string; body: string }[]`（从 `scripts/markdown.mjs`）
  - `node scripts/design.mjs latest [--dir <path>]` → 打印最新一条 `confirmed` 记录的 id（按 D 编号取最大，确定性）；
    无则打印原因并 **退出码 3**。`--dir` 覆盖搜索根（默认 `work/designs`），供测试注入空目录
  - 导出 `pickLatest(records: { id: string }[]): string | null`，供测试直接断言选择规则
  - `node scripts/design.mjs refusals [id]` → 逐行打印拒绝清单的 `- <输入> → <改做什么>`；该块被显式跳过时打印 `跳过: <理由>` 并退出 0（**不是**空列表）；无 confirmed 记录时退出 3
  - `node scripts/design.mjs constraints [id]` → 打印判断点条数与动作权限表
- Consumes: `loadSchema()`、`scripts/markdown.mjs`

- [ ] **Step 1: 写失败测试**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, unlink, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sections } from './markdown.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIRMED = join(ROOT, 'work/designs/confirmed');

const run = (args) => promisify(execFile)(process.execPath, [join(ROOT, 'scripts/design.mjs'), ...args])
  .then((r) => ({ code: 0, out: r.stdout }))
  .catch((e) => ({ code: e.code ?? 1, out: e.stdout ?? '' }));

test('sections does not truncate a filled block at its first blank line', () => {
  // 第一版用 `\s*$` 在 m 模式下匹配，把每个块截断在紧跟标题的空行上；
  // 四份写得好好的设计记录因此被报成空块。
  const secs = sections('## 一、流程形状\n\n固定两步。\n\n## 二、拒绝清单\n\n- 输入 A → 改成 B\n');
  assert.match(secs[0].body, /固定两步/);
  assert.match(secs[1].body, /输入 A → 改成 B/);
});

test('refusals reports an explicit skip, never an empty list', async () => {
  const probe = join(CONFIRMED, 'D-901-skip-probe.md');
  await writeFile(probe, [
    '---', 'id: D-901', 'title: probe', 'status: confirmed', '---',
    '## 一、流程形状', '', '固定两步。', '',
    '## 二、拒绝清单', '', '（跳过：只读，没有动作）', '',
    '## 三、动作权限', '', '（跳过：只读）', '',
    '## 四、交接契约', '', '（跳过：单一调用）', '',
    '## 什么情况说明这个设计错了', '', '拿不到真实输入时。', '',
  ].join('\n'), 'utf8');
  try {
    const { code, out } = await run(['refusals', 'D-901']);
    assert.equal(code, 0);
    assert.match(out, /跳过：只读，没有动作/);
    // 「跳过」和「没有要拒绝的」是相反的意思，绝不能混
    assert.doesNotMatch(out, /没有要拒绝的/);
  } finally {
    await unlink(probe).catch(() => {});
  }
});

test('latest picks the highest confirmed D-number, not the first directory entry', async () => {
  const a = join(CONFIRMED, 'D-901-aaa.md');
  const b = join(CONFIRMED, 'D-902-bbb.md');
  const fm = (id) => ['---', `id: ${id}`, 'title: probe', 'status: confirmed', '---', '## 一、流程形状', '', 'x', ''].join('\n');
  await writeFile(a, fm('D-901'), 'utf8');
  await writeFile(b, fm('D-902'), 'utf8');
  try {
    const { code, out } = await run(['latest']);
    assert.equal(code, 0);
    assert.match(out.trim(), /D-902/);   // 按编号取最大，不依赖 readdir 顺序
  } finally {
    await unlink(a).catch(() => {});
    await unlink(b).catch(() => {});
  }
});

test('latest exits 3 with a reason when nothing is confirmed', async () => {
  const empty = await mkdtemp(join(tmpdir(), 'designs-'));
  try {
    const { code, out } = await run(['latest', '--dir', empty]);
    assert.equal(code, 3, '「没有设计」必须与「设计说不用拒绝」区分开');
    assert.match(out, /no confirmed|没有已确认/);
  } finally {
    await rm(empty, { recursive: true, force: true });
  }
});
```

注意最后一条：`--dir` 是给测试用的搜索根覆盖（默认 `work/designs`）。
没有这个接缝，测「没有已确认记录」就只能去动真实的 `D-001`，那不可接受。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test scripts/design.test.mjs`
Expected: FAIL — cannot find module `./markdown.mjs`

- [ ] **Step 3: 抽出 `scripts/markdown.mjs`**

把 `scripts/work.mjs` 里的 `sections()`（设计记录四块校验用的那个）原样搬过来并导出，
`work.mjs` 改为 `import { sections } from './markdown.mjs'`。
**保留它的修复注释**：第一版用 `\s*$` 在 `m` 模式下把每个块截断在空行，四份正确的记录被误报为空。

- [ ] **Step 4: 实现 `scripts/design.mjs`**

三个子命令。读取范围限定 `work/designs/confirmed/*.md`。
`latest` 按 `D-\d+` 的数值取最大，不依赖文件名排序或目录返回顺序。
退出码 3 的语义是「没有可读的东西，原因已打印」——
它让调用方能把「没有设计」和「设计说不用拒绝」区分开。

- [ ] **Step 5: 跑测试确认通过**

Run: `node --test scripts/design.test.mjs`
Expected: PASS（4 个测试）

- [ ] **Step 6: 提交**

```bash
git add scripts/markdown.mjs scripts/design.mjs scripts/design.test.mjs scripts/work.mjs
git commit -m "feat(design): read a confirmed design record into what downstream stages consume"
```

---

### Task 8: 让开发与验收接住设计记录

**Files:**
- Modify: `.claude/skills/anb-judgeable/SKILL.md`
- Modify: `.claude/skills/anb-runnable/SKILL.md`
- Modify: `.claude/skills/anb-design/SKILL.md`（把承诺改成命令）
- Modify: `scripts/site/build_pages.py`（`DETAIL['verify']` 与 `DETAIL['build']` 的说明）

**Interfaces:**
- Consumes: `node scripts/design.mjs latest|refusals|constraints`（Task 7）
- Produces: 无

- [ ] **Step 1: `anb-judgeable` 接住拒绝清单**

在 `## How to run it` 的第 1 步之前插入：先跑
`node scripts/design.mjs refusals`，把每一行变成一条检查。
退出码 3 时**明说「没有已确认的设计记录，因此这一层护栏无法建立」并继续**——
不得静默跳过（静默跳过正是失败图鉴第三类「保护永不启动」）。
若输出是 `跳过: <理由>`，照抄该理由说明这一层为什么为空。

- [ ] **Step 2: `anb-runnable` 读设计约束**

在 `## What to build` 后加一段：开工前跑 `node scripts/design.mjs constraints`，
把判断点当作必须由模型决定的地方（不要在开发时用固定逻辑把它写死成特判），
把动作权限表当作实现边界。退出码 3 时照常继续，但记一句「本次无设计约束」。

- [ ] **Step 3: `anb-design` 把承诺改成命令**

exit test 里「每一行都能写成一条会变红的检查」改为
「验收阶段会用 `node scripts/design.mjs refusals` 读走这份清单」，
使承诺有具体的接收端。

- [ ] **Step 4: 站点同步**

`DETAIL['verify']` 的 skills 列表与说明、`DETAIL['build']` 的说明里，
写明这一步会读设计记录；重建站点。

- [ ] **Step 5: 验证**

Run:
```bash
node scripts/design.mjs refusals          # 期望：打印 D-001 的 5 行拒绝清单，退出 0
node scripts/site/build.mjs && node scripts/site/links.mjs
node scripts/naming.mjs check
```
Expected: 拒绝清单可见；站点断链 0；无硬编码编号。

- [ ] **Step 6: 提交**

```bash
git add .claude/skills docs/site scripts/site
git commit -m "fix(anb): the build and verify stages read the design record"
```

---

### Task 9: 迭代闭环——从观测结论落成 requirement 或 ticket

**Files:**
- Modify: `.claude/skills/anb-reusable/SKILL.md`
- Modify: `scripts/site/build_pages.py`（`DETAIL['iterate']` 的分支指向命令）

**Interfaces:**
- Consumes: `node scripts/design.mjs`（无关）／`node scripts/work-move.mjs`（既有）
- Produces: 无

**背景**：站点 07-iterate 已有「有了真实使用数据，知道该改什么 → 回到需求」这条分支，
但 `anb-reusable` 0 次提及观测数字，只讲模板抽取。skill 与站点对同一阶段说法不一致，
而 skill 才是 agent 真正执行的东西。

- [ ] **Step 1: 给 `anb-reusable` 补上这条分支**

在「What to keep」之前加 `## What to change`：拿 `anb-observable` 的三个数字
（跑了多少次、花了多少、为什么失败）来回答「该改什么」；
每个改动写成一条 `R-` 或 `T-` 记录，落进 `work/requirements/` 或 `work/tickets/`。
判据沿用票的规则：跨会话才开票，一次会话内做完的不开。

- [ ] **Step 2: 站点对齐**

`DETAIL['iterate']` 的「有了真实使用数据」分支说明里加上
`node scripts/work-move.mjs` 与寄存器路径，使站点与 skill 说的是同一件事。

- [ ] **Step 3: 验证闭环保留**

Run:
```bash
grep -c "observation\|ran\|cost\|failed" .claude/skills/anb-reusable/SKILL.md
```
Expected: 非 0 —— 这个阶段现在确实引用了观测数字。

- [ ] **Step 4: 重建站点并提交**

```bash
node scripts/site/build.mjs && node scripts/site/links.mjs
git add .claude/skills docs/site scripts/site
git commit -m "fix(anb): close the loop from observation back to a requirement"
```

---

### Task 10: 补齐交付阶段的提示词

**Files:**
- Modify: `scripts/site/build_prompts.py`
- Modify: `docs/site/prompts.html`（由生成器重建）

**Interfaces:**
- Consumes: `node scripts/site/build.mjs`（Task 1）
- Produces: 无

**背景**：交付阶段只有 3 条提示词，是全表最少的一档；而对不写代码的人，部署是最硬的墙。

- [ ] **Step 1: 加 4 条提示词**

按既有 `(用途, 提示词, 什么时候用, 为什么这样写)` 四元组格式，加入：

1. 列出所有密钥与配置项，逐个确认它们来自环境而不是文件
2. 选一个部署平台，说出取舍（不选"最好的"，选最省事的）
3. 算一遍配额：一次使用消耗多少、总共多少、第几个用户会撞墙
4. 出事后怎么退回去（回滚）

- [ ] **Step 2: 重建并核对数字**

```bash
node scripts/site/build.mjs && node scripts/facts.mjs --check
```
Expected: 提示词总数由 37 变为 41，且 `facts --check` 通过
（若数字被文档引用，同时更新引用处）。

- [ ] **Step 3: 提交**

```bash
git add scripts/site docs/site
git commit -m "docs(prompts): give the ship stage the prompts it was missing"
```

---

### Task 11: `anb-manage` 的清单补上 `work/designs/`

**Files:**
- Modify: `.claude/skills/anb-manage/SKILL.md`

**Interfaces:**
- Consumes: `work/LAYOUT.md`、`work/schema.yml`
- Produces: 无

- [ ] **Step 1: 补清单**

`## Where things live` 的列表里加
`- \`work/designs/\` — 四问的设计记录；确认后是规格，不是文档`，
位置在 tickets 之前（它是 design 阶段的产出）。

- [ ] **Step 2: 补一个用例**

`## The four things you will be asked to do` 加第五条：
「这份设计还算数吗」——读 `work/designs/confirmed/`，
被推翻的用 `work-move.mjs` 移到 `superseded`（不改原件）。

- [ ] **Step 3: 验证与提交**

Run: `node scripts/work.mjs check && node scripts/layout.mjs`
Expected: 两者都退出 0。

```bash
git add .claude/skills/anb-manage
git commit -m "fix(anb): the management skill knows about design records"
```

---

## 收尾

全部任务完成后跑一遍完整门禁：

```bash
node scripts/work.mjs check
node scripts/work.mjs check --only design
node scripts/layout.mjs
node scripts/facts.mjs --check
node scripts/naming.mjs check
node scripts/site/build.mjs && git diff --exit-code docs/site/
node scripts/site/links.mjs
node --test scripts/*.test.mjs
```

九个都通过后，从远端全新 `git clone` 再跑一次同样的门禁
（证明提交的确实是可复现的状态，而不是本地临时物），然后推送。
