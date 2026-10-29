# 目录归属表

**一条铁律：每一类信息只有一个家。可以被多处引用，不能被复制。**

复制是最贵的错误，因为它不会立刻出错——它会先安静地存两份，等改了一个忘了另一个时才出问题。
这个仓库已经犯过一次：执行票同时住在 `.scratch/…/issues/` 和 `work/tickets/`。已删除前者。

---

## 判断标准只有一个：它会不会变？

| | 会变 | 不会变 |
|---|---|---|
| 特征 | 有状态、会流转、会关闭、会过期 | 写完就不该再动 |
| 住哪 | `work/` | `docs/` |
| 例子 | 票从 open 走到 done、事故从 open 到 closed、产物会过期 | ADR 接受后不改、规格是某一版的快照 |

这条标准比"按主题分"可靠。按主题分的话，"决策"既像工作又像文档，每次都要重新吵一遍；
按"会不会变"分，"ADR 接受后就不该改"是一个明确的事实，不需要判断。

---

## 归属表

### `work/` — 有生命周期的东西

| 目录 | 放什么 | 状态机 | ID | 谁写 | 什么时候清 |
|---|---|---|---|---|---|
| `work/requirements/` | 需求：一句话承诺 | drafting → awaiting-verification → confirmed → dropped | `R-` | 需求 | 被废后留 30 天 |
| `work/designs/` | 设计记录：四问的答案 | drafting → confirmed → superseded | `D-` | 设计 | 保留；被推翻进 superseded，不改原件 |
| `work/metrics/` | 指标卡：八项必有字段 | **无状态机，版本号即生命周期** | 无 | 设计–开发 | 永不删；改口径 = 加版本，不改旧卡 |
| `work/tickets/` | 执行票：跨会话的工作单元 | open → in-progress → awaiting-verification → done | `T-` | 开发–交付 | 永不删（历史） |
| `work/incidents/` | 事故：计划外发生的事 | open → contained → closed | `INC-` | 任何阶段 | 关闭后留 90 天 |
| `work/artifacts/` | 有持续成本的东西：脚本、开关、面板、定时任务 | active → expired | `ART-` | 运营 | 到过期日即删 |
| `work/evidence/` | 证据：一条可复跑的命令 + 原始输出 | **无状态，只增不改** | `E-` | 验收 | 永不删 |
| `work/receipts/` | 回执：交付给谁、什么时候、对方怎么确认 | **无状态，只增不改** | `REC-` | 交付 | 永不删 |

**证据和回执为什么没有状态机**：它们一旦记下就不该被润色。给它们加状态，就会出现"证据待审核"这种东西，
而审核过的证据和没审核的证据在可信度上没有区别——它只是一条命令的输出。

**为什么只有跨会话的工作才开票**：一次会话内做完并验证的，不需要票。否则票会变成流水账，流水账没人看。

### `docs/` — 不该再变的东西

| 目录 | 放什么 | 谁写 | 什么时候变 |
|---|---|---|---|
| `docs/adr/` | 架构决策记录 | 设计 | 永不修改；被取代时加 `superseded_by`，旧文件原地保留 |
| `docs/evals/` | 评测设计与用例说明 | 验收 | 随产品演进，但每次改要带版本号 |
| `docs/product/` | 产品论点、路线图 | 需求 | 少改；改要写清为什么 |
| `docs/agents/` | 给 agent 读的流程约定（票据格式、提交规范） | 任何阶段 | 少改 |
| `docs/skills/` | skill 目录与来源说明 | 运营 | 随 skill 增减 |
| `docs/plans/` | 实施计划：某一版的施工图 | 设计 | 写完不改；被取代时新开一份 |
| `docs/policy/` | **产品的输入文档**：品牌政策、规则清单等 | 设计 | 少改；改要写清为什么 |
| `docs/product/method-audit-*.md` | 方法自身的审计快照 | 迭代 | 写完不改；下次审计新开一份 |
| `docs/from-zero.md` | 从零搭仓库的顺序 | 一次性 | 不改 |

**ADR 为什么不在 `work/`**：它没有状态机。接受之后就是一份历史记录，说"这个 ADR 现在是 done"没有意义。

**设计记录为什么在 `work/`，而 ADR 不在**：这两条看起来矛盾，其实用的是同一个标准。
ADR 接受后不改，所以没有状态。设计记录会变——起草、确认、被推翻——`superseded` 是它的常态，
而一个会被推翻的东西需要状态机，所以它在 `work/`。

两者的分工是：**设计记录写"我们决定了什么"，ADR 写"为什么这样选、放弃了什么"。**
一条设计记录通常指向两三条 ADR，只留指针，不复制正文。

### `docs/site/` — 成品（受 Pages 限制）

| 路径 | 放什么 | 说明 |
|---|---|---|
| `docs/index.html` | 入口，跳转到 `site/` | Pages 访问 `/` 时找它 |
| `docs/site/*.html` | 13 个生成页 | **生成物，不手改**；用 `node scripts/site/build.mjs` 重建 |
| `docs/site/originals/*.html` | 8 份手写原件 | **源文件，未改一字**；不参与生成，也不参与孤儿检测 |
| `docs/site/.nojekyll` | 阻止 Jekyll 处理 | 必需 |

**为什么原件要单独一个子目录**：站点上写着这八份「未改一字」，而 LAYOUT 之前把整个
`docs/site/` 描述成「生成物，不手改」——两句话互相矛盾。目录结构必须反映这个区别，
否则重建时的孤儿检测分不清「构建残留」和「不许动的东西」，前者该删，后者删了就没了。

`build.mjs` 先输出到暂存目录再比对，所以「哪些是生成物」不需要任何手工维护的清单——
那份清单本身就会过时。

### `deploy/` — 交付物

| 路径 | 放什么 | 说明 |
|---|---|---|
| `deploy/*` | 镜像、compose、网关 server 块、部署与验收脚本 | 与信息寄存器无关；运行手册在 `deploy/README.md` |

它既不是会变的记录（`work/`），也不是不该再变的文档（`docs/`），而是“把产物送上生产”
这一件事的固定工具。放在顶层是因为部署脚本要在仓库根执行；声明在这里是为了让
`layout.mjs` 不必为一个有意的目录开例外。

**为什么站点在 `docs/` 里面，而不是平级的 `site/`**：GitHub Pages 只能从仓库根或 `/docs` 发布，
不能指定子目录。放在 `docs/site/` 是唯一能同时满足「Pages 能发布」和「站点与规格分开」的布局。

这是一个**外部约束造成的例外**，不是设计偏好。`docs/adr/`、`docs/evals/`、`docs/product/`
是给 agent 读的规格；`docs/site/` 是给访客看的成品。它们在同一个父目录下，但各占一个子目录，不混。

**如果将来有一天能改 Pages 的发布目录**（比如换用 Actions 部署），把 `docs/site/` 移回平级的
`site/` 是更好的结构。这件事记在这里，免得下一个人以为当前布局是首选。

### 代码与工具

**关于「工具必须有登记」这条规则**：它原本写的是 `scripts/` 下的东西一律要在
`work/artifacts/` 登记。实际执行中从来没有遵守过——`scripts/` 里的十二个脚本有十个没有登记，
而 `layout.mjs` 也不校验这一条。一条既不校验、也没人遵守的规则，和一个永远不会失败的检查
是同一种东西。

收窄之后它才成立：**登记针对的是有持续运营成本的东西**——对外提供的服务、定时任务、
探针、开关、面板。`scripts/` 下的 `schema`、`work`、`facts`、`layout`、`naming`、`build`、
`links` 这些是仓库自己的脚手架：它们随仓库一起存在，不会「累积」，删掉任何一个仓库就不完整了。
站点生成器登记为 `ART-001`，因为它有一条真实的删除条件（站点若移出仓库它就该消失）。

这条区分**无法机械化**，所以它只能是一条需要判断的规则。写在这里，是为了让下一个读到的人
知道它被考虑过、而不是被漏掉。

| 目录 | 放什么 | 说明 |
|---|---|---|
| `packages/` | 可复用的库 | 依赖方向单向：apps → core → shared |
| `apps/` | 可部署的应用 | 薄，没有业务逻辑 |
| `scripts/` | 本仓库自己的工具链 | 属于仓库的脚手架，不登记（见下） |
| 其它有持续成本的脚本 | 服务、定时任务、探针、开关 | **必须有 `work/artifacts/` 登记**，否则会累积 |
| `scripts/site/` | 站点生成器（Python）+ 重建入口 `build.mjs` | 登记为 `ART-001`；改站点内容改这里，不改 `docs/site` 的生成页 |
| `scripts/collect-*.mjs` `scripts/region-corr.mjs` `scripts/panel-fit.mjs` `scripts/verify-conclusion.mjs` | 数据产品的层契约与检查器 | **脚手架**：删掉任何一个，对应的层就没有可执行的验收了。它们随仓库存在，不单独登记 |
| `scripts/stats.mjs` `scripts/conclusion-conditions.mjs` | 被上面四个共用的计算与条件库 | 同上。统计与证伪条件是**唯一实现**，不许在别处再写一份 |
| `anb-*/` | 方法论的实验样本 | 可运行，能复现 |

---

## 已废弃的位置

| 位置 | 曾经放什么 | 现在归哪 | 什么时候删的 |
|---|---|---|---|
| `.scratch/<feature>/issues/` | 执行票 | `work/tickets/` | 2026-10-24 |
| 会话临时目录里的站点生成器 | 站点无法从仓库重建，只能手改 HTML | `scripts/site/` | 2026-10-25 |
| `work/decisions/` | （我从没往里面放过东西） | `docs/adr/` | 2026-10-24，建了就撤 |

**这张表本身也要维护。** 每次移动一类东西，在这里加一行。否则半年后没人知道某个空目录该不该存在。

---

## 怎么校验

```bash
node scripts/work.mjs check     # 校验 work/ 下的记录（含设计四块是否齐全）
node scripts/layout.mjs         # 校验目录归属：文件放错地方会报错
```

`work check` 管记录内容，`layout` 管文件位置，`facts --check` 管文档里引用的数字。三个都要过。

数据产品的四条链路各有自己的门禁，也都要过：

```bash
node scripts/collect-audit.mjs --demo ; test $? -eq 1     # 采集：三个静默错误都被抓到
node scripts/region-corr.mjs --demo   ; test $? -eq 1     # §七：识别不成立时说停
node scripts/panel-fit.mjs --demo                          # 分析：能产出一个带区间的数
node scripts/verify-conclusion.mjs --demo ; test $? -eq 1  # 报告：造了触发必须报
node scripts/metric-card.mjs check                         # 指标：八项缺一项就失败
```

这些命令在 `.github/workflows/check.yml` 里各是一步，所以「某一层没有检查器」和
「某一层的检查器坏了」在 CI 输出里长得不一样。详见 `docs/product/data-product-layers.md`。

**`facts` 存在的理由**：文档里每写一次「109 个 skill」，就是一次会过时的声明。
而它不会报错——过时的数字和新鲜的数字长得一模一样。这已经发生过：站点首页一度写着
「六类假信号」，而图鉴里已经有七类。一个自称关于「数错了」的方法，把自己的数写错，
是最难看的自相矛盾。

所以数字只有一个家：`node scripts/facts.mjs` 从磁盘算出来，文档写进去，`--check` 校验。
新增内容后先跑 `facts`，再改文档。

## 提交时的坑（INC-001）

**在这个挂载目录里，`git status` 会说谎。** 它会报上百个 `M`，而 `git diff` 为空、
内容与 HEAD 逐字节一致。`git add` 还会报 `short read while indexing`。

所以：

- **提交在 `/tmp` 做**：`cp -a` 复制 `.git` 和工作区到 `/tmp`，在那里 add / commit / push
- **校验用 `git ls-tree` + `md5sum`**，不要用 `git status`
- **不要用 `tar` 在两处之间复制**：它给短文件补 NUL，把 markdown 变成二进制

细节和证据见 `work/incidents/closed/INC-001-*.md`。
