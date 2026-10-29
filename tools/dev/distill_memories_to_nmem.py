#!/usr/bin/env python3
"""四层记忆批量蒸馏脚本 — mas_router_method → Nowledge Mem `mas-router` Space.

按 SOP v2.0（.lody/attachments/0eda3844-SOP_Nowledge_Mem_*.md）第 4 步落地：
内容全部蒸馏自仓库真源（CLAUDE.md、docs/adr/、docs/product/、docs/evals/），
每条标注 src 出处；unit_type 严格取自 nmem 8 个合法枚举。

用法：
    python3 tools/dev/distill_memories_to_nmem.py --dry-run   # 只打印，不写库
    python3 tools/dev/distill_memories_to_nmem.py             # 实际入库
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys

SPACE = "mas-router"
AGENT = "mas-router-dev"

# ————————————————————————————— 四层记忆 —————————————————————————————
# 层级约定：L1 核心准则(decision, 1.0) / L2 业务口径(fact, 0.9)
#          L3 避坑实证(learning, 0.85) / L4 沉淀纪要(context, 0.7)
MEMORIES: list[dict] = [
    # ——— L1 · 核心准则 (importance 1.0, unit_type decision, timeless) ———
    {"title": "依赖方向单向铁律", "importance": 1.0, "unit_type": "decision", "when": "timeless",
     "labels": "identity,redline,architecture,recipe-agent",
     "content": "依赖只能单向：apps/workbench 与 apps/bot-gateway → packages/core → packages/shared；packages/feishu 由 core 引用；packages/evals → core + shared。packages/shared 不 import 本仓任何包。两包需要同一类型必须进 shared，出现第二份定义即 bug——只在 schema 变更后才暴露，最贵的 bug 类。src: CLAUDE.md#architecture"},
    {"title": "run-agent 单文件循环不拆分", "importance": 1.0, "unit_type": "decision", "when": "timeless",
     "labels": "identity,redline,architecture",
     "content": "packages/core/src/run-agent.ts 拥有 agent 循环全部职责：model 调用、step 记录、预算执行、取消、成本核算，刻意保持一个文件。拆分循环跨模块 = 预算检查在关键路径上失效的经典成因。index.ts 的 createRuntime() 组装工具为 in-process MCP server 并暴露唯一 run()。src: CLAUDE.md#core"},
    {"title": "工具定义走 ports 而非客户端", "importance": 1.0, "unit_type": "decision", "when": "timeless",
     "labels": "identity,architecture,tooling",
     "content": "tools/brand.ts 声明 BrandStore/ReferenceStore/RecipeStore/VisionAnalyzer 接口并基于接口构建 MCP 工具；生产传真实现，eval harness 传 fake，两者 prompt 可见契约完全一致——这是无 live Feishu 也能测 agent 行为的前提。加工具必须同步改两处：createBrandTools 工具数组 + brandToolNames() 白名单；漏白名单 = 静默 no-op，最难察觉的 agent bug。src: CLAUDE.md#tools"},
    {"title": "工具失败是值不是异常", "importance": 1.0, "unit_type": "decision", "when": "timeless",
     "labels": "identity,redline,tooling",
     "content": "tools/result.ts 契约：ok(text, data) / err(text, retryable)，经 toCallToolResult 转换。handler 抛异常杀死整个 run；返回 isError: true 让模型看见失败并重试。guard() 兜底让意外异常降级而非死亡。src: CLAUDE.md + docs/adr/0003"},
    {"title": "headless SDK 配置四决定", "importance": 1.0, "unit_type": "decision", "when": "timeless",
     "labels": "identity,redline,sdk",
     "content": "1) permissionMode 'dontAsk'——headless bot 无人可提示，白名单外工具被拒而非排队；2) settingSources 保持空数组——workflow prompt 即全部 brief，ambient 仓库配置不得泄漏进客户 bot，不得加 'project'；3) maxBudgetUsd + 循环内成本检查双保险——SDK 限额在昂贵 turn 后触发，循环检查在下一个 turn 前停；4) 成本核算读 modelUsage 而非 result.usage（后者仅主循环、按 turn；前者累计且含 subagents）。src: CLAUDE.md#sdk + docs/adr/0004 + docs/adr/0005"},
    {"title": "schema 是不信任边界", "importance": 1.0, "unit_type": "decision", "when": "timeless",
     "labels": "identity,redline,schema",
     "content": "模型输出是不受信输入。packages/shared 用 Zod 在持久化边界校验，畸形 recipe 必须响亮失败，不得变成 review 队列里的怪卡。schema 层拥有领域对象定义（ADR-0002）。src: CLAUDE.md#schemas + docs/adr/0002"},
    {"title": "双测试纪律：单测绿不等于完成", "importance": 1.0, "unit_type": "decision", "when": "timeless",
     "labels": "identity,redline,evals,process",
     "content": "pnpm test 验证你的代码（step 映射、预算算术、schema 校验、错误路径），无模型调用，CI 每次 commit 跑。Eval run 验证 agent 判断，调真模型花钱，只在行为变更时跑（prompt 编辑、工具 schema 变更、模型升级、数据形状变更）。eval 集即 spec：无 eval case 的 spec 是愿望，ticket 单测绿不算完成，eval case 过才算。src: CLAUDE.md#two-kinds-of-test"},
    {"title": "TS 版本钉死 5.9.3 与严格开关", "importance": 1.0, "unit_type": "decision", "when": "timeless",
     "labels": "identity,boundary,tooling",
     "content": "TypeScript 钉 5.9.3 不升 7.x：typescript-eslint@8 声明 typescript <6.1.0，升级即断 lint，待其支持 7 再议。exactOptionalPropertyTypes 与 noUncheckedIndexedAccess 开启（可选属性需 '?: T | undefined'，参见 tools/brand.ts 的 metrics 字段模式）；verbatimModuleSyntax 开启（type-only import 必须 import type）；包 exports 指 ./src/index.ts，开发期免构建。src: CLAUDE.md#typescript-constraints"},

    # ——— L2 · 业务口径 (importance 0.9, unit_type fact, timeless) ———
    {"title": "产品形态与双 surface 分工", "importance": 0.9, "unit_type": "fact", "when": "timeless",
     "labels": "caliber,recipe-agent,product",
     "content": "产品是 TikTok 品牌内容的 native agent：输入爆款参考视频，产出 Recipe（该视频的可克隆抽象，按品牌换皮，结构化到 shooter 可执行）。两个刻意分离的 surface：apps/workbench 是 operator 面（review recipes、inspect runs、编辑 brand guardrails、读 eval 分数，Next.js App Router + Feishu OAuth）；apps/bot-gateway 是 Feishu 面即实际工作发生地。两者调同一 runtime，只是请求到达方式与结果去向不同。src: CLAUDE.md#what-this-is"},
    {"title": "品牌种子数据唯一真源", "importance": 0.9, "unit_type": "fact", "when": "timeless",
     "labels": "caliber,seed,recipe-agent",
     "content": "四个品牌档案（brand profiles）唯一真源在 packages/core/src/seed/brands.ts。eval fixtures 不得复制品牌档案——evals 依赖 core，复制会在 guardrail 变更那一刻漂移，而 guardrails 正是 should_fail 用例的构建基础。src: CLAUDE.md#dependency-direction"},
    {"title": "main agent 能力图口径（2026-10-29 交付）", "importance": 0.9, "unit_type": "fact", "when": "timeless",
     "labels": "caliber,main-agent,consult",
     "content": "packages/consult：能力图 20 节点 17 路由，便携知识 bundle，BM25 检索，grounded answer composer，direct plays（false premises、conflict/authority/governance、follow-ups），可选 Anthropic/OpenAI synthesis，58 tests。apps/bot-gateway：WebSocket 长连接（默认，无公网 URL）+ HTTP webhook（POST /events）双模式；幂等、per-chat 队列、按 bot open_id 提及匹配、reply fallback、线程会话 SQLite 持久化、doctor/configure/authorize/eval CLI，45 tests。验收与限制见 docs/product/main-agent-capability-graph.md。src: CLAUDE.md#main-agent"},
    {"title": "eval 数据集口径", "importance": 0.9, "unit_type": "fact", "when": "timeless",
     "labels": "caliber,evals,main-agent",
     "content": "eval 集 150 案例（83 真实群问题 + 67 对抗/冲突/多轮），150/150 自动可评、150 可人工复审；确定性 rubric 均值 0.99。LLM judge 已接线但需要 key。packages/evals harness：14 cases、15 条确定性规则、store conformance，30 tests；rubric judging 未实现，eval run 从未触达真模型。eval 设计文档 docs/evals/main-agent-real-qa.md。src: CLAUDE.md + docs/evals/"},
    {"title": "包结构与命令口径", "importance": 0.9, "unit_type": "fact", "when": "timeless",
     "labels": "caliber,process,tooling",
     "content": "workspace 包：@mas/shared、@mas/core、@mas/feishu、@mas/consult、@mas/evals、apps/workbench、apps/bot-gateway。每包定义 typecheck/build/test/clean。命令一律 pnpm --filter <name> <script>；单测文件 cd packages/core && ./node_modules/.bin/vitest run <file>。evals 调真模型花钱，不属于 pnpm test。apps/workbench 目前是 placeholder（设计已 spec，仅 session resolution + placeholder page）。src: CLAUDE.md#commands + #current-state"},
    {"title": "工程流程与知识源约定", "importance": 0.9, "unit_type": "fact", "when": "timeless",
     "labels": "caliber,process,skills",
     "content": "流程 vendored 在 .claude/skills/（34 个，见 VENDOR.md）；客户端插件 38 个不在仓内、需前缀调用（如 anthropic-skills:agent-browser）；Agent Native Builder 13 个（.claude/skills/anb*）。判断 skill 是否存在先查 docs/skills/skill-catalog.md 的 source 列——首轮审计曾误报 42 个假 skill。/native-agent-dev 主流程：clarify→spec→tickets→build→eval→release；/anb 是非技术 builder 的独立六阶段流。issue tracker 用本地 .scratch/<feature>/issues/（无 remote）。GLOSSARY.md 单一、ADR 在 docs/adr/。src: CLAUDE.md#process"},

    # ——— L3 · 避坑实证 (importance 0.85, unit_type learning, timeless) ———
    {"title": "unit_type 只用 8 个合法枚举", "importance": 0.85, "unit_type": "learning", "when": "timeless",
     "labels": "pitfall,nmem,harden",
     "content": "nmem 的 unit_type 只接受 fact/preference/decision/plan/procedure/learning/context/event。传 rule 报错（映射为 decision），传 insight 报错（映射为 learning 或 fact）。蒸馏脚本上线前必须先跑 dry-run 核对枚举。src: SOP v2.0 合规枚举警示"},
    {"title": "nmem .md 文件 MIME 陷阱", "importance": 0.85, "unit_type": "learning", "when": "timeless",
     "labels": "pitfall,nmem,library,harden",
     "content": "nmem-server 文档解析器把 .md 判为 application/octet-stream 二进制流并拒绝解析（报错 did not look like readable text）。标准解法：nmem library add 前把文件复制为 .markdown 或 .txt 后缀传入 /tmp，即可 100% 识别为 text/markdown 并切片 indexed。本项目 18 份真源全部按此归档成功。src: SOP v2.0 第 3.2 步 + 本项目 T-02 实证"},
    {"title": "evals 从未触达真模型", "importance": 0.85, "unit_type": "learning", "when": "timeless",
     "labels": "pitfall,evals,recipe-agent",
     "content": "packages/evals 的 harness 与案例齐备，但历史上唯一一次 eval run 尝试因无 API key 失败——至今没有任何 eval run 达到真模型。所以'eval 通过'目前只是 harness 级断言，不是模型级验证；宣称 agent 行为已验证前必须核实这一点。LLM judge 同样只接线未跑。src: CLAUDE.md#current-state"},
    {"title": "skill 三源表易判错", "importance": 0.85, "unit_type": "learning", "when": "timeless",
     "labels": "pitfall,skills,process",
     "content": "本仓 skill 有三个来源、位置不同：vendored 34 个在 .claude/skills/（按名调用）；客户端插件 38 个不在仓内（需前缀如 anthropic-skills:agent-browser）；ANB 13 个（.claude/skills/anb*）。.claude/skills/ 里缺 ≠ 不存在，先查 docs/skills/skill-catalog.md 的 source 列再下结论——首轮审计曾把 42 个 skill 误报为假。src: CLAUDE.md#project-process"},
    {"title": "工作区部分 Markdown Node 读为二进制", "importance": 0.85, "unit_type": "learning", "when": "timeless",
     "labels": "pitfall,workspace,harden",
     "content": "本 workspace 的部分 Markdown 文件以压缩形态存储，Node 的 fs 读出来是二进制而 Python open() 返回真实 UTF-8。因此知识物化走 scripts/materialize-main-knowledge.py（Python 通道）产出便携 JSON bundle；Node 侧脚本读仓内 .md 前先确认是否能解出文本，读不动就换 Python 通道。src: CLAUDE.md#main-agent + scripts/materialize-main-knowledge.py"},

    # ——— L4 · 沉淀纪要 (importance 0.7, unit_type context, past) ———
    {"title": "main agent 里程碑画像（2026-10-29）", "importance": 0.7, "unit_type": "context", "when": "past",
     "labels": "history,main-agent,analytics",
     "content": "2026-10-29 主线：consult 能力图 + bot-gateway Feishu 双模式 + feishu 富文本/提及/线程解析交付，配套 150 案例 eval 集（自动 150/150、rubric 0.99）、盲审 packet（docs/evals/main-agent-blind-review.md、main-agent-human-review.md、main-agent-usage.md、main-agent-live-check.md）、ADR-0010 共享状态决议、演进记录 docs/product/recipe-agent-evolution-2026-10-29.md。测试规模：consult 58、bot-gateway 45、feishu 24、core 31、evals 30。src: git status + docs/product/"},
    {"title": "recipe agent 当前完成度画像", "importance": 0.7, "unit_type": "context", "when": "past",
     "labels": "history,recipe-agent,analytics",
     "content": "分层完成度：shared schema 完整；core runtime/工具契约/SQLite+vod 适配器/四种子品牌/store 契约套件齐（31 tests）；feishu 包有签名验证/解密/事件规范化（24 tests）但 delivery 与 HTTP server 未建；workbench 仅 placeholder（设计已 spec）；evals harness 14 cases + 15 确定性规则（30 tests）但 rubric judging 未实现、未触真模型；bot-gateway 已是 live 面。src: CLAUDE.md#current-state"},
    {"title": "agent 产品方法论画像", "importance": 0.7, "unit_type": "context", "when": "past",
     "labels": "history,methodology,analytics",
     "content": "本仓沉淀的方法论：一切 agent 产品必须做对的事发生在'一个循环'里；工具契约与实现分离使 agent 行为可测；失败是值让模型自愈；schema 边界让脏输出响亮失败；eval 集是唯一的 spec。分层归因顺序 eval→data→tool→prompt，跳层修 prompt 是 agent 工作变慢的主因。/anb 六阶段（idea→runs→judgeable→shipable→observable→reusable）+ 五 checks 与 /native-agent-dev 共享 runtime 但不同受众。src: CLAUDE.md + ANB-README.md"},
]


def run_add(m: dict, dry_run: bool) -> tuple[bool, str]:
    content = m["content"]
    if dry_run:
        return True, f"[dry-run] {m['title']} ({len(content)} chars, {m['unit_type']}@{m['importance']})"
    cmd = [
        "nmem", "memories", "add", content,
        "--space", SPACE,
        "--agent-id", AGENT,
        "--title", m["title"],
        "--importance", str(m["importance"]),
        "--unit-type", m["unit_type"],
        "--when", m["when"],
        "--source", "distill-script",
        "--source-app", "mas-router-distill",
    ]
    for label in m["labels"].split(","):
        cmd.extend(["--label", label.strip()])
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    out = (r.stdout + r.stderr).strip().splitlines()
    return r.returncode == 0, (out[-1] if out else "")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true", help="只打印拟入库清单，不调用 nmem")
    args = ap.parse_args()

    if args.dry_run:
        print(f"SPACE={SPACE} AGENT={AGENT} TOTAL={len(MEMORIES)}\n")
        for m in MEMORIES:
            ok, msg = run_add(m, dry_run=True)
            print(msg)
        return 0

    ok_n = fail_n = 0
    for m in MEMORIES:
        ok, msg = run_add(m, dry_run=False)
        print(f"{m['title']:32s} {'OK ' if ok else 'FAIL'} {msg[:90]}")
        ok_n, fail_n = ok_n + (1 if ok else 0), fail_n + (0 if ok else 1)
    print(f"\nOK={ok_n} FAIL={fail_n} TOTAL={len(MEMORIES)}")
    return 1 if fail_n else 0


if __name__ == "__main__":
    sys.exit(main())
