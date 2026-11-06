"""实战用法：证据层（第四批）的两个案例。

与行为层、流程层、编排层分开成文件。practices_data.py 把四个列表接成
统一的 PRACTICES 出口，页面和阶段页只依赖那个出口。

每条效果的措辞都归属到作者（作者报告），不写成站点自己的结论。
"""

EVIDENCE_PRACTICES = [
    {
        'id': 'system-prompts-leaks',
        'layer': 'evidence',
        'repo': 'asgeirtj/system_prompts_leaks',
        'repo_url': 'https://github.com/asgeirtj/system_prompts_leaks',
        'title': 'System Prompts Leaks：把系统提示词当成可对照的工程材料',
        'one_line': '18 个厂商、约 1900 份提示词，按产品和版本归档，能看到行为契约的结构和演变。',
        'facts': [
            ('覆盖', '18 个顶层目录：Anthropic 666、OpenAI 435、Meta 474、GLM 90、xAI 76、Google 67 等，共约 1900 份文件'),
            ('Anthropic 目录', 'claude.ai 提示词、Claude Code、artifact types、integrations；每个文件标注产品，不混用'),
            ('Claude Code 结构', 'System prompt、Harness、Memory、Environment、Context management、Delivering work、Writing for the user、Agents、Skills、Tools'),
            ('工具提示词', '每个工具一段：Agent、Artifact、AskUserQuestion、Bash、CronCreate、Edit、Monitor 等；还有 auto mode classifier 和 advisor tool 两侧提示词'),
            ('最新条目', '2026-11-03 的 Claude Code auto mode classifier，139 KB，按 Sonnet 5 发送'),
            ('引用', 'Washington Post、CEPS AI World、Simon Willison 都基于这个仓库做过报道或分析'),
        ],
        'problem': '想研究一个 agent 产品为什么这样表现，只看自己的提示词不够；你需要看到同一类行为在不同厂商、不同版本里怎么写。这个仓库把各家的系统提示词逐份归档：Claude、ChatGPT、Gemini、Grok、Cursor、Kimi、DeepSeek、GLM、Meta、Mistral、Perplexity、MiniMax 等。它不是一篇分析文章，是一堆可对照的原始材料；价值在横向和纵向的比较，不在单份提示词本身。',
        'method': [
            ('按产品归档', 'Anthropic 目录先分 claude.ai、Claude Code、artifact types、integrations；文件名标注模型和产品。bare claude-<model>.md 是 claude.ai，claude-code/ 是 CLI harness，不是同一个东西。'),
            ('分版本', '同一产品保留多个版本，比如 Fable 5.1、Fable 5、Opus 5.5、Opus 5、Opus 4.8；能看到行为契约怎么随时间变。'),
            ('按组件拆', 'Claude Code 的提示词拆成 system prompt、harness、memory、environment、agents、skills、tools；每个工具单独一份，能看工具接口怎么描述。'),
            ('标注来源和日期', 'README 的 recent additions 表写清日期和文件；每份文件保留原文，不改写。'),
            ('当参考材料用', '不整段搬进产品。先对照结构，找出身份、工具、安全、格式、记忆、拒绝、版权这些段，再决定自己产品要保留哪一段。'),
        ],
        'cases': [
            ('Anthropic 目录为什么先分产品', 'Anthropic/README.md 明确说：bare claude-<model>.md 是 claude.ai 的系统提示词，不是 API 提示词，也不是 Claude Code 提示词；claude-code/ 是 CLI harness；official/ 是 Anthropic 自己发布的短版。这个区分让「同一模型在不同产品里的行为差异」变成可比较的问题，而不是把三份不同的东西混成一份。'),
            ('Claude Code 提示词的骨架', 'Fable 5.1 的 Claude Code 提示词有清晰的段落：System prompt、Harness、Memory、Environment、Context management、Delivering work、Writing for the user、Agents、MCP Server Instructions、Skills、Tools。工具部分每个工具一段，写清什么时候用、什么时候不用、参数和行为。看这个骨架，比看某一句具体措辞更有用。'),
            ('怎么用它做自己的提示词', '先选一个和自己产品最像的样本，按段对照；把平台实现和行为原则分开；只保留跨模型仍然成立的行为段，平台段用自己的实现替换。不要整段复制，也不要把别人的产品信息、工具接口、内部 UI 带进来。'),
        ],
        'tables': [
            {'caption': '仓库覆盖（顶层目录与文件数）', 'headers': ['厂商或目录', '文件数', '代表内容'], 'rows': [
                ['Anthropic', '666', 'claude.ai、Claude Code、artifact types、integrations'],
                ['OpenAI', '435', 'ChatGPT、Codex、voice 等'],
                ['Meta', '474', 'Llama 系列与产品提示词'],
                ['GLM', '90', 'ZCode Desktop、GLM 系列'],
                ['xAI', '76', 'Grok、Grok Bot、skills'],
                ['Google', '67', 'Gemini、Antigravity IDE 和 CLI'],
                ['其他', '约 100', 'Cursor、Kimi、DeepSeek、Mistral、Perplexity、MiniMax、Qwen、Notion、Pi、Microsoft'],
            ]},
            {'caption': 'Claude Code 提示词的段落', 'headers': ['段', '内容'], 'rows': [
                ['System prompt', '身份、总体行为、工具使用原则'],
                ['Harness', '运行环境、浏览器自动化、会话规则'],
                ['Memory', '记忆文件、索引、环境、会话上下文'],
                ['Context management', '上下文管理和压缩'],
                ['Delivering work', '怎么交付、怎么写给用户看'],
                ['Agents / Skills / Tools', '子代理、技能、每个工具的接口和用法'],
            ]},
        ],
        'stages': ['design', 'build', 'verify', 'manage', 'ship'],
        'apply': [
            'design：按段对照同产品、同模型的不同版本，找行为契约的变化。',
            'build：看工具提示词怎么写「什么时候用、什么时候不用、失败返回什么」。',
            'verify：用 auto mode classifier 和 advisor tool 的提示词看安全检查和审查契约。',
            'manage：把参考材料按厂商、产品、版本归档，标注来源和日期。',
            'ship：只保留跨模型成立的行为段，平台段自己实现。',
        ],
        'prompt': '把这份系统提示词按段拆开，和同产品的上一个版本对照：哪些段是行为原则，哪些段是平台实现？只保留跨模型仍然成立的行为段，平台段用我们自己的实现替换。不要整段复制别人的产品信息、工具接口或内部 UI。',
        'effect': '作者维护了约 1900 份文件、18 个厂商目录；Washington Post、CEPS AI World 和 Simon Willison 都用它做过分析或报道。它的价值不是某一句话，而是让「同一行为在不同厂商、不同版本里怎么写」变成可以逐段对照的材料。',
    },
    {
        'id': 'claude-directory',
        'layer': 'evidence',
        'repo': 'pulkitxm/claude-directory',
        'repo_url': 'https://github.com/pulkitxm/claude-directory',
        'title': 'claude-directory：用 prompt、成品和录屏证明一个案例真的能跑',
        'one_line': '541 个项目，每个都带 prompt.md、可运行代码、demo.mp4 和 poster.jpg。',
        'facts': [
            ('规模', '9 个类别，541 个项目：templates 241、landing-pages 98、shaders 84、hero-sections 41、ui-design 34、components-ui 15、portfolios 14、animations-loaders 12、3d-games 2'),
            ('三件套', 'prompt.md、可运行的项目代码、demo.mp4；poster.jpg 由脚本生成'),
            ('栈', 'React、TypeScript、Vite、Tailwind、Three.js、Framer Motion、GSAP，也有纯 HTML/CSS/JS'),
            ('贡献规则', '只有两条硬要求：prompt.md 和 demo.mp4；PR 由 Claude Opus 审查合并'),
            ('自动检查', '每个项目自带 verify.mjs：390、768、1280 三个宽度，检查标题、canvas、opacity、图片、横向溢出、console error、失败响应、菜单交互'),
            ('交付流程', 'worktree、分类目录、verbatim prompt.md 先提交、完整构建、CLI 验证、review、录 demo、生成 poster、README 登记、PR、合并、清理'),
        ],
        'problem': '一个 AI 生成的页面看起来不错，不等于它能跑、能在手机上用、没有 console error。claude-directory 把每个案例做成一个自包含项目，并且坚持三件套：prompt.md 记录它怎么被生成，完整代码让人能跑，demo.mp4 证明它真的动起来。仓库明说整个目录是 vibe coded，所以它同时给了 verifier 和 auditor：不是让你相信截图，而是让你能重跑检查。',
        'method': [
            ('三件套', 'prompt.md 是原始提示词，保留生成意图；项目代码是完整可运行实现；demo.mp4 是实际运行的录屏；poster.jpg 是视频加载前的占位图。'),
            ('自包含', '每个项目一个文件夹，资源本地化，能克隆后离线跑；分类按产物类型，不按技术栈。'),
            ('自动验证', 'verify.mjs 在 390、768、1280 三个宽度跑 headless Chromium，检查标题、canvas 尺寸、opacity、图片数量与破损、横向溢出、console error、4xx 或 5xx 响应；1280 宽度还点开菜单确认交互。'),
            ('生成流程', '.claude/agents/fable-experimenter.md 规定固定交付流程：worktree、查重、选分类、先提交 verbatim prompt.md、完整构建、CLI-only 验证、review、录 demo、生成 poster、README 登记、PR、合并、清理。'),
            ('审计流程', '.claude/agents/template-auditor.md 对 premium clone 做同源审计：读 REFERENCE: URL，抓原站和 clone 的截图、样式、响应式、交互、明暗主题，vision-judge diff，发现 gap 直接修，再录 demo、生成 poster、更新 README。'),
            ('诚实标注', 'README 明说整个仓库是 vibe coded，上线前要 review 代码、检查依赖、验证可访问性和响应式、跑本地检查。'),
        ],
        'cases': [
            ('一个案例的交付长什么样', '以 3d-games/lovable-webgl-hero 为例：prompt.md 是逐字保留的 uppercase 提示词，项目里有完整的 TanStack Start、React、Tailwind 代码和本地化的 public/vendor/ 资产，demo.mp4 是实际录屏，poster.jpg 是占位图，verify.mjs 在三个宽度跑 headless 检查。任何人克隆后可以重跑，不需要相信作者的截图。'),
            ('verify.mjs 检查什么', '它打开 390、768、1280 三个宽度，等 network idle 再等 4 秒，读取 h1、canvas 尺寸、hero opacity、图片数量和 broken images、横向溢出；监听 console error 和 4xx 或 5xx 响应；1280 宽度还点开 Solution 和 Resources 菜单，确认 Founders 和 Blog 可见。任何一项失败就非零退出。'),
            ('为什么还要 auditor', '生成 agent 会漏东西：少一个页面、少一个 section、响应式断点没做、hover 状态不对、明暗主题没切。template-auditor 把原站和 clone 都抓一遍，按页面、section、样式、响应式、交互、主题逐项 diff，发现 gap 直接修，再录 demo、生成 poster、更新 README。它不是只出报告，而是修到 same-to-same。'),
        ],
        'tables': [
            {'caption': '目录规模', 'headers': ['类别', '项目数', '内容'], 'rows': [
                ['templates', '241', '完整模板，含 premium clone'],
                ['landing-pages', '98', '多 section 落地页'],
                ['shaders', '84', 'GLSL 和 WebGL 视觉'],
                ['hero-sections', '41', '首屏 hero'],
                ['ui-design', '34', '设计系统与风格探索'],
                ['components-ui', '15', '独立组件与 UI 片段'],
                ['portfolios', '14', '个人作品集'],
                ['animations-loaders', '12', '动画、加载、转场'],
                ['3d-games', '2', '3D 场景与可玩游戏'],
            ]},
            {'caption': '三件套与检查', 'headers': ['产物', '证明什么', '怎么验证'], 'rows': [
                ['prompt.md', '生成意图和可复现的输入', '逐字保留，先提交'],
                ['完整代码', '项目能跑、能改、能离线', '克隆后安装依赖并运行'],
                ['demo.mp4', '它真的动起来、交互可用', '录屏，不是截图'],
                ['poster.jpg', '视频加载前的占位', '脚本生成'],
                ['verify.mjs', '三个宽度、无 console error、无横向溢出', 'headless Chromium 重跑'],
            ]},
        ],
        'stages': ['design', 'build', 'verify', 'ship', 'operate'],
        'apply': [
            'design：先写 prompt.md，保留生成意图；按产物类型选分类。',
            'build：项目自包含，资源本地化，能离线跑。',
            'verify：用 headless 检查三个宽度、console error、broken images、横向溢出和关键交互；不要只看截图。',
            'ship：交付三件套：prompt、可运行代码、录屏；poster 作为占位。',
            'operate：README 计数和 posters.json 要跟目录一致；定期跑 auditor 修 drift。',
        ],
        'prompt': '把这个案例做成可复查的三件套：prompt.md 逐字保留生成提示词；项目代码完整可运行、资源本地化；demo.mp4 记录实际运行。交付前用 headless 浏览器在 390、768、1280 三个宽度检查标题、关键元素、图片、横向溢出、console error 和关键交互。不要用截图代替运行。',
        'effect': '作者维护了 541 个项目、9 个类别；每个项目都有 prompt.md 和 demo.mp4，PR 由 Claude Opus 审查合并；每个项目可以带自己的 verify.mjs，template-auditor 对 premium clone 做同源审计并直接修到 same-to-same。README 明说整个仓库是 vibe coded，上线前要自己 review，这句话本身就是证据层的一部分。',
    },
]
