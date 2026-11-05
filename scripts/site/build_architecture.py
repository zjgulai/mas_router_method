"""架构全景页：整合 Recipe Agent + Main Agent + ANB 方法论 + 开发工具链。

全景蓝图源在 architecture/mas-router-panorama.spec.json（由 @rokoai/arch-diagram 校验构建）。
这一页将五层单向依赖拓扑、三大单源真源契约、以及可交互的蓝图内联挂入站点导航，
确保零外部依赖且在禁用 JS 时依然完整可读。
"""
import html as html_lib
import os

from build_shell import page
from paths import REPO, out_dir


def architecture_page():
    panorama_path = os.path.join(REPO, 'architecture', 'mas-router-panorama.html')
    with open(panorama_path, encoding='utf-8') as fh:
        raw_html = fh.read()
    # 注入暖檀色主题变量覆盖，使内嵌架构蓝图的底色、面板与高亮融入全站暖粉品牌视觉
    warm_theme_override = (
        '<style>'
        ':root{'
        '--bg:#190c11;'
        '--panel:#241219;'
        '--text:#efe2e6;'
        '--head:#faf4f5;'
        '--dim:#b5949e;'
        '--faint:#593843;'
        '--cyan:#e899b1;'
        '--blue:#f0b6c8;'
        '--green:#7ad6a6;'
        '--purple:#d4a5f5;'
        '--amber:#f2c17d;'
        '}'
        '</style>'
    )
    raw_html = raw_html.replace('</head>', warm_theme_override + '</head>', 1)
    escaped_srcdoc = html_lib.escape(raw_html, quote=True)

    b = [
        '<style>'
        '.arch-frame-wrap{background:#190c11;border:1px solid var(--deep);border-radius:2px;margin:1.5rem 0 2.6rem;overflow:hidden}'
        '.arch-frame-bar{display:flex;justify-content:space-between;align-items:center;padding:.75rem 1.25rem;'
        'background:var(--side-bg);color:var(--side-text);font-size:.82rem;border-bottom:1px solid var(--side-border)}'
        '.arch-frame-bar code{background:#301820;color:#f4dce3;padding:.12rem .48rem}'
        '.arch-frame{display:block;width:100%;height:1220px;border:0;background:#190c11}'
        '@media(max-width:1100px){.arch-frame{height:980px}}'
        '@media(max-width:760px){.arch-frame{height:760px}}'
        '</style>'
    ]
    b.append('<h1>全产品架构全景图</h1>')
    b.append('<p class="lede">本仓库承载两条核心 Agent 产品线（<b>Recipe Agent</b> 品牌视频克隆生成与 <b>Main Agent</b> 方法论与数据咨询）、'
             '一套可执行的方法论门禁（<b>ANB 7+1 阶段与 8×8 数据矩阵</b>），以及本地开发态三件套（<b>Nowledge Mem + Lody + Magpie</b>）。</p>')

    b.append('<div class="note"><b>架构三条死律。</b><br>'
             '1. <b>依赖单向不可逆</b>：<code>apps/workbench</code> 与 <code>apps/bot-gateway</code> 严禁互相 import，只能单向调用 <code>packages/core</code> 或 <code>packages/consult</code>；<code>packages/shared</code> 零内部依赖。<br>'
             '2. <b>三大唯一真源</b>：领域对象唯一真源在 <code>packages/shared</code>（Zod 边界强校验）；四个品牌护栏唯一真源在 <code>packages/core/src/seed/brands.ts</code>；生命周期阶段唯一真源在 <code>work/schema.yml</code>。<br>'
             '3. <b>分层归因铁律</b>：修复 Agent 质量问题严格按 <code>eval → data → tool → prompt</code> 顺序排查，严禁跳过底层数据与工具契约直接改提示词。</div>')

    b.append('<h2 id="blueprint">一、交互式终端蓝图 (@rokoai/arch-diagram)</h2>')
    b.append('<p class="h2sub">支持悬停高亮上下游链路与实时信号追踪（Live Trace）。定义源：<code>architecture/mas-router-panorama.spec.json</code>。</p>')
    b.append('<div class="arch-frame-wrap">'
             '<div class="arch-frame-bar">'
             '<span>MAS Router Method · 13 核心节点 · 12 条类型化数据流</span>'
             '<code>architecture/mas-router-panorama.spec.json</code>'
             '</div>'
             f'<iframe class="arch-frame" title="MAS Router Method 全产品架构全景图" srcdoc="{escaped_srcdoc}"></iframe>'
             '</div>')

    b.append('<h2 id="layers">二、五层架构职责与边界对账</h2>')
    b.append('<p class="h2sub">每一层只做自己的事，跨层越界（如在评测夹具里复制品牌档案、在工具 handler 里抛异常）一律视为架构缺陷。</p>')
    layers = [
        ('L1 交互入口层 (Surfaces)', 'apps/bot-gateway · apps/workbench · docs/site',
         '飞书长连接/Webhook 异步回执与会话分桶；Operator 审查台（Next.js）；ANB 静态知识门户（29 生成页 + 8 原始档案）。',
         '严禁任何 Surface 直接调用大模型 API，所有执行必须经过底层 Runtime；Surface 之间严禁互相引用。'),
        ('L2 核心双引擎层 (Engines)', 'packages/core · packages/consult',
         'core：run-agent.ts 单文件主循环（步数记录、双层预算熔断、modelUsage 累计计费、ok/err/guard 值语义工具）；consult：20 节点 + 17 路由能力图谱、BM25 物理化知识包与五段式 grounded 合成。',
         'run-agent.ts 的主循环严禁拆碎到多模块；工具 handler 严禁 throw 异常，失败必须返回 isError: true 的值。'),
        ('L3 契约、适配与评测底座', 'packages/shared · packages/feishu · packages/evals',
         'shared：Zod 领域模型（BrandProfile / ReferenceVideo / Recipe / AgentRun）；feishu：事件验签解密、post 富文本与卡片格式化；evals：14 用例 + 15 确定性规则 + Rubric 裁判。',
         'packages/shared 不得 import 仓内任何包；新增工具必须同步写入 createBrandTools 与 brandToolNames() 白名单。'),
        ('L4 ANB 治理与数据矩阵层', 'work/ · docs/product/ · scripts/',
         'work/ 八个寄存器（状态即目录，ls 即看板）；matrix.json（8×8 数据产品矩阵）与 tables.json（13 张样张表）；build.mjs 零孤儿页生成器。',
         '无检查器的契约只能标「约」不能标「验」；文档引用的数字必须通过 facts.mjs --check 对账。'),
        ('L5 本地开发工具链', 'Nowledge Mem · Lody · Magpie',
         'Nowledge Mem 负责跨会话记忆注水与红线守门；Lody 负责 4 机执行池、Git Worktree 隔离与异步任务回执；Magpie 负责 127.0.0.1:3425 三协议互转与 group/* 429 容灾。',
         '开发态工具链不介入生产部署运行时；不在 Nowledge Mem 存业务数据。'),
    ]
    b.append('<table><thead><tr><th style="width:18%">架构层级</th><th style="width:22%">核心包 / 目录</th><th style="width:34%">核心职责</th><th>硬性护栏与禁令</th></tr></thead><tbody>'
             + ''.join(f'<tr><td><b>{l}</b></td><td><code>{p}</code></td><td>{r}</td><td>{g}</td></tr>' for l, p, r, g in layers)
             + '</tbody></table>')

    b.append('<h2 id="relations">三、核心跨模块调用与数据流向</h2>')
    flows = [
        ('飞书群提问 / TikTok 链接', 'apps/bot-gateway → packages/core | packages/consult',
         '网关识别 TikTok 链接或 /recipe 指令走 core 异步生成管道（3s 回执 + 队列投递）；识别方法论/数据提问走 consult 引擎返回五段式结论。'),
        ('Operator 人工审查与重跑', 'apps/workbench → packages/core',
         '审查台调用同一个 createRuntime().run() 接口，与飞书端共享完全一致的系统提示词、工具契约与 Zod 持久化边界。'),
        ('离线确定性评测与模型裁判', 'packages/evals → packages/core + packages/shared',
         '评测台注入 Fake 端口实现（与生产端口签名 100% 一致），直接从 core/src/seed/brands.ts 读取四品牌护栏，杜绝夹具漂移。'),
        ('单一真源驱动站点构建', 'work/schema.yml + docs/product/*.json → scripts/site/build.mjs → docs/site/',
         '13 个 Python 生成器从 schema.yml、matrix-check.mjs、tables.json 与 .claude/skills/ 动态计算全部页面，经 links.mjs 校验死链与孤儿页。'),
    ]
    b.append('<table><thead><tr><th style="width:22%">业务流场景</th><th style="width:32%">调用路径</th><th>契约保障</th></tr></thead><tbody>'
             + ''.join(f'<tr><td><b>{s}</b></td><td><code>{p}</code></td><td>{d}</td></tr>' for s, p, d in flows)
             + '</tbody></table>')

    sections = [
        ('blueprint', '交互式架构蓝图'),
        ('layers', '五层职责与护栏'),
        ('relations', '跨模块调用流向'),
    ]
    return page('architecture', '全产品架构全景图', '\n'.join(b),
                '<a href="./">总览</a> / 架构全景',
                desc='MAS Router Method 全产品架构全景图：Recipe Agent、Main Agent、ANB 方法论与本地开发工具链的五层拓扑与单向依赖契约。',
                sections=sections)


if __name__ == '__main__':
    full = architecture_page()
    open(os.path.join(out_dir(), 'architecture.html'), 'w', encoding='utf-8').write(full)
    print('architecture.html 生成')
