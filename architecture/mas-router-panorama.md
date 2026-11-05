# MAS Router Method 全产品架构全景图

元素：交互入口 (Surfaces) ｜ 核心运行时与咨询引擎 (Engines) ｜ 契约、评测与适配底座 (Contracts & Gates) ｜ ANB 方法论与生成站点 (Methodology & Site) ｜ 本地开发工具链 (Agent Toolchain)  
流向：运行时调用 / 协议转发 ｜ 单向模块依赖 / 契约约束（虚线） ｜ 门禁校验 / 站点生成 ｜ 开发态注入 / 路由代理（虚线）

```mermaid
flowchart TB
  %% MAS Router Method · 全产品架构全景图 · Recipe Agent + Main Agent + ANB 方法论 + 开发工具链
  subgraph g_surfaces["双交付面 + 知识门户 · 严禁互相 import · 共享底座"]
    workbench["<b>apps/workbench</b><br/>Operator 审查台 · Next.js<br/>Recipe 审查队列 · Run 轨迹回放<br/>品牌护栏编辑 · 评测分数对账"]:::surface
    bot_gw["<b>apps/bot-gateway</b><br/>飞书交付面 · WS 长连接 + HTTP<br/>事件去重 · 3s 回执 · 会话分桶队列<br/>分流 /recipe 生成与群内咨询提问"]:::surface
    anb_site["<b>docs/site · ANB 知识门户</b><br/>29 生成页 + 8 原始档案<br/>7 阶段 + 管理 · 8×8 矩阵 · 13 表<br/>作战手卡 36 条 · 工具链 · 图谱"]:::method
  end
  subgraph g_engines["核心双引擎 · Recipe Agent + Main Agent"]
    core["<b>packages/core · Recipe Agent</b><br/>run-agent.ts 单文件主循环 · createRuntime()<br/>run-agent.ts · 步数记录 · 预算双保险 · 累计计费<br/>tools/brand.ts · Brand · Reference · Recipe · Vision<br/>tools/result.ts · ok / err / guard · 失败即值<br/>seed/brands.ts · 4 品牌画像唯一真源"]:::engine
    consult["<b>packages/consult · Main Agent</b><br/>20 能力节点 · 17 路由 · 150 评测集 (0.99)<br/>capability-graph · 4 轴定位 · 首检路由 · 假前提拦截<br/>BM25 + 知识包 · 物理化知识库 · 严格引文校验<br/>answer-composer · 结论 · 定位 · 依据 · 下一步<br/>LLM Synthesis · 可选合成 · 禁编造仓库外路径"]:::engine
  end
  subgraph g_contracts["Schema 边界 + 飞书协议 + 评测底座"]
    feishu["<b>packages/feishu</b><br/>飞书协议适配层 · 24 单测<br/>事件验签与解密 · post 富文本抽取<br/>mention 解析 · 话题 thread 追踪<br/>Recipe 卡片格式化与投递契约"]:::contract
    shared["<b>packages/shared</b><br/>Schema 唯一真源 · 零内部依赖<br/>Brand · Reference · Recipe<br/>持久化边界 Zod 强校验<br/>禁止任何包二次定义同名类型"]:::contract
    evals["<b>packages/evals</b><br/>评测即 Spec · 14 Cases + 15 规则<br/>Store 契约套件 · Fake 端口注入<br/>EVAL_RUBRIC=on 激活真实模型裁判<br/>归因：eval → data → tool"]:::contract
  end
  subgraph g_governance["ANB 治理与数据矩阵 · 单一真源驱动站点与检查器"]
    work_gov["<b>work/ · 8 寄存器与机器门禁</b><br/>状态即目录 (ls 即看板) · 零手工编号<br/>work/schema.yml 唯一阶段源 · 8 类 ID 寄存器<br/>work.mjs check · layout.mjs · facts.mjs"]:::method
    data_gov["<b>docs/product/ · 8×8 矩阵与 13 张表</b><br/>数据产品契约 (Momcozy) + 站点构建器<br/>matrix.json (matrix-check) · tables.json (xref)<br/>build.mjs 驱动 13 个 Python 生成器 + links.mjs"]:::method
  end
  subgraph g_toolchain["开发态三件套 · 记忆 → 调度 → 路由"]
    nowledge["<b>Nowledge Mem</b><br/>记忆层 · Space: mas-router<br/>SessionStart · 注入简报 + 守门规则<br/>8 类持久记忆 · BM25 + 向量混合检索<br/>Thread 蒸馏 · 对话存证 → 结论沉淀<br/>红线守门 · 单向依赖 · 单源真源"]:::toolchain
    lody["<b>Lody 控制平面</b><br/>多机调度 · Worktree 隔离<br/>跨机执行池 · 4 台机器并行会话<br/>Git Worktree · 分支隔离 · 零冷启动<br/>持久任务总线 · operationId 异步回执<br/>Diff 评审 · 行级批注回传下一轮"]:::toolchain
    magpie["<b>Magpie 路由网关</b><br/>127.0.0.1:3425 · 单二进制<br/>协议转换 · 三套主流协议互转<br/>group/* 容灾 · free 探索 / opus 生成<br/>订阅桥接 · 官方 CLI 子进程管道<br/>本地账本 · usage.jsonl · 脱敏"]:::toolchain
  end
  workbench -->|"createRuntime()"| core
  bot_gw -->|"/recipe 生成"| core
  bot_gw -->|"群内方法咨询"| consult
  core -.->|"飞书端口适配"| feishu
  core -.->|"Zod 边界校验"| shared
  evals -.->|"Fake 端口 + brands.ts"| core
  evals -.-> shared
  work_gov -->|"schema.yml + 寄存器门禁校验"| data_gov
  data_gov -->|"build.mjs"| anb_site
  nowledge -.->|"① 会话注水 + 规则"| lody
  lody -.->|"② import-magpie"| magpie
  magpie -.->|"③ 代理模型"| evals
  linkStyle 0 stroke:#6fdc8c,stroke-width:1.5px
  linkStyle 1 stroke:#6fdc8c,stroke-width:1.5px
  linkStyle 2 stroke:#6fdc8c,stroke-width:1.5px
  linkStyle 3 stroke:#5ad1e6,stroke-width:1.5px
  linkStyle 4 stroke:#5ad1e6,stroke-width:1.5px
  linkStyle 5 stroke:#5ad1e6,stroke-width:1.5px
  linkStyle 6 stroke:#5ad1e6,stroke-width:1.5px
  linkStyle 7 stroke:#e8b25d,stroke-width:1.5px
  linkStyle 8 stroke:#e8b25d,stroke-width:1.5px
  linkStyle 9 stroke:#b48cff,stroke-width:1.5px
  linkStyle 10 stroke:#b48cff,stroke-width:1.5px
  linkStyle 11 stroke:#b48cff,stroke-width:1.5px
  classDef surface fill:#0e141b,stroke:#79a8ff,color:#c9d1d9
  classDef engine fill:#0e141b,stroke:#6fdc8c,color:#c9d1d9
  classDef contract fill:#0e141b,stroke:#5ad1e6,color:#c9d1d9
  classDef method fill:#0e141b,stroke:#e8b25d,color:#c9d1d9
  classDef toolchain fill:#0e141b,stroke:#b48cff,color:#c9d1d9
  classDef none fill:#0e141b,stroke:#3a4450,color:#c9d1d9
  style g_surfaces fill:transparent,stroke:#79a8ff,stroke-dasharray:5 4,color:#79a8ff
  style g_engines fill:transparent,stroke:#6fdc8c,stroke-dasharray:0,color:#6fdc8c
  style g_contracts fill:transparent,stroke:#5ad1e6,stroke-dasharray:5 4,color:#5ad1e6
  style g_governance fill:transparent,stroke:#e8b25d,stroke-dasharray:5 4,color:#e8b25d
  style g_toolchain fill:transparent,stroke:#b48cff,stroke-dasharray:5 4,color:#b48cff
```
