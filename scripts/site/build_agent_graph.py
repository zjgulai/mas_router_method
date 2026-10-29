import sys, os
from build_shell import page
from paths import out_dir

def agent_graph_page():
    b = ['<h1>Main Agent 能力图谱</h1>']
    b.append('<p class="lede">从「方法文档」到「飞书群里可用的咨询 Agent」。'
             '这个项目最值钱的不是写代码，而是<b>把数据产品 / Agent 产品从想法推到可验收</b>的判断与证据体系。'
             'Main Agent 将这套体系变为可路由、可引用、可拒绝的能力网络。</p>')

    b.append('''<div class="note"><b>核心原则。</b>
Main Agent 不是通用闲聊机器人。它以仓库中的已验证事实（代码、ADR、设计记录、评测用例、检查器）为唯一依据。
回答结构固定：【结论】一句话可执行 + 【定位】四条轴坐标 + 【依据】2–3 条短引文与路径 + 【下一步动作】。</div>''')

    b.append('<h2 id="axes">一、四条核心坐标轴</h2>')
    b.append('<p class="h2sub">定位一个问题时，先确定它落在哪个坐标系中。混淆四者是项目失控的最常见原因。</p>')
    axes = [
        ('生命周期 (7+1)', '需求 → 设计 → 开发 → 验收 → 交付 → 运营 → 迭代 → 管理', '现在处在哪一步？这一步的关门条件是什么？'),
        ('数据产品层 (8)', '采集 → 存储 → 打标 → 指标 → 分析 → 呈现 → 结论 → 报告', '问题卡在哪一层？这一层的输入/输出/失败模式是什么？'),
        ('横切三柱 (3)', '口径 / 质量 / 血缘', '这个数字的定义、可信度、来路能不能说清？'),
        ('Agent 交付车道', 'Incident / Exploration / Capability / Fast (G1–G5)', '这是能力问题还是确定性问题？最少要过哪几道门？'),
    ]
    b.append('<table><thead><tr><th style="width:20%">坐标轴</th><th style="width:45%">取值范围</th><th>回答的核心问题</th></tr></thead><tbody>'
             + ''.join(f'<tr><td><b>{a}</b></td><td><code>{v}</code></td><td>{q}</td></tr>' for a, v, q in axes)
             + '</tbody></table>')

    b.append('<h2 id="nodes">二、十七个能力节点</h2>')
    b.append('<p class="h2sub">Main Agent 咨询引擎内部维护的 17 个能力节点与主责范围。</p>')
    nodes = [
        ('navigate-capabilities', '能力导航', '先判断问题属于哪条轴，避免把工程问题当模型问题解决。'),
        ('intent-and-decision', '意图与决策', '先写「要改变哪个动作」和停止信号，通不过不进入设计。'),
        ('data-conclusion-card', '结论卡规范', '结论卡六项必填，证伪条件必须可执行、可检验。'),
        ('metric-contract', '指标契约', '一个指标一个明确定义，口径变更升级版本号、不重算历史。'),
        ('collection-time', '采集时点', '<code>first_seen_at</code> 是锚点，抓得晚会被错误读成「更热」。'),
        ('storage-lineage', '存储与血缘', '只追加、读侧迁移、版本四元组，保证旧记录始终可读。'),
        ('labeling-taxonomy', '打标体系', '标签带版本、标注带置信度、维护金标准集与 Kappa 门槛。'),
        ('analysis-identification', '分析与识别', '先跑相关性门禁，再做区域固定效应估计，避免伪相关。'),
        ('presentation-drilldown', '呈现与下钻', '聚合数必须可逐级下钻，明确区分空值与异常状态。'),
        ('reporting-falsification', '报告与证伪', '主动报告「哪条旧结论失效了」，结论具备时效性。'),
        ('agent-playbook', 'Agent 行为边界', 'Playbook 锁目标与边界，工具层做硬护栏，不靠提示词兜底。'),
        ('eval-quality', '评测质量', 'Eval set 就是 spec；严格区分确定性检查与模型主观评分。'),
        ('agent-failure-diagnosis', '失败诊断', '修复顺序铁律：eval → 数据 → 工具 → prompt，绝不反向。'),
        ('delivery-lanes', '交付车道', '按四车道分流，严格守住 G1~G5 五道交付硬门。'),
        ('method-governance', '方法治理', '没有能变红的命令就是愿望；单一来源与机器门禁。'),
        ('feishu-surface', '飞书网关', '事件验签、3秒异步应答、幂等去重、长连接与 Webhook。'),
        ('long-running-tasks', '长任务处理', '超长任务回执确认、异步队列调度与任务进度通知。'),
    ]
    b.append('<div class="grid two">'
             + ''.join(f'<div class="card" id="node-{k}"><h3>{title} <span style="font-family:var(--mono);font-size:.75rem;color:var(--faint);font-weight:400">{k}</span></h3><p style="margin:0;font-size:.88rem;color:var(--muted)">{desc}</p></div>' for k, title, desc in nodes)
             + '</div>')

    b.append('<h2 id="routes">三、急诊分诊台：症状 → 首检 → 处方</h2>')
    b.append('<p class="h2sub">用户描述症状时，路由引擎优先匹配首检成本最低的路线。</p>')
    routes = [
        ('有个想法，不知道从哪开始', 'route-idea', '写「要改变哪个动作」', '写停止信号；先定 C1–C4 结论框架'),
        ('声量 → GMV 归因不可信', 'route-attribution', '<code>region-corr</code> 检验', '相关系数 >0.8 停机；补缺货/促销控制变量'),
        ('两个报表数字对不上', 'route-metric-drift', '<code>metric-card check</code>', '比对两处口径版本；强制指标卡对账'),
        ('不同区域数据不可比', 'route-collection-lag', '<code>collect-audit</code>', '检查首次见到时间；按帖子发布年龄折算'),
        ('标签改版后历史不可比', 'route-label-version', '<code>label-audit</code>', '旧数据禁止覆盖；建立跨版本映射表'),
        ('报告没人看 / 结论没人信', 'route-report-theater', '核对结论卡六项', '证伪条件函数化；增加数据下钻支撑'),
        ('Agent 答错 / 不稳定', 'route-agent-quality', '抓取最小复现 Case', '严格按 eval → 数据 → 工具 → prompt 排查'),
        ('Playbook 不知道写什么', 'route-agent-scope', '七项模板检查', '只锁目标与边界；在工具层加硬限制'),
        ('流程太重 / 不知走哪条', 'route-delivery-process', '四问判别交付车道', '只守 G1–G5 硬门，其余按需剪裁'),
        ('检查全绿但心里没底', 'route-fake-green', '检查命令退出码与证据', '核对是否具备能变红的真实失败测试'),
        ('飞书没反应 / 重复回复', 'route-feishu', '<code>bot-gateway check</code>', '检查事件订阅权限、OpenID 匹配与幂等表'),
    ]
    b.append('<table><thead><tr><th style="width:24%">用户症状</th><th style="width:18%">路由 ID</th><th style="width:24%">第一检查动作</th><th>推荐处方</th></tr></thead><tbody>'
             + ''.join(f'<tr><td><b>{sym}</b></td><td><code>{r}</code></td><td>{chk}</td><td>{rx}</td></tr>' for sym, r, chk, rx in routes)
             + '</tbody></table>')

    b.append('<h2 id="pipeline">四、咨询引擎的执行链路</h2>')
    b.append('<pre>用户提问\n  │\n  ├─ 1. 分类：匹配 17 个能力节点与意图范围（低于阈值则追问或礼貌拒绝）\n  ├─ 2. 路由：根据 14 条症状路线确定最经济的首检建议\n  ├─ 3. 检索：BM25 检索知识库 chunk（优先匹配规范定义与事实依据）\n  ├─ 4. 成文：按照【结论 / 定位 / 依据 / 下一步 / 边界】五段式严格输出\n  └─ 5. 校验：禁止大模型生成无依据的路径与指令\n</pre>')

    sections = [
        ('axes', '四条坐标轴'),
        ('nodes', '十七个能力节点'),
        ('routes', '急诊分诊台'),
        ('pipeline', '咨询执行链路'),
    ]
    return page('agent-graph', 'Main Agent 图谱', '\n'.join(b), '<a href="./">总览</a> / Agent 图谱', sections=sections)

if __name__ == '__main__':
    open(os.path.join(out_dir(), 'agent-graph.html'), 'w', encoding='utf-8').write(agent_graph_page())
    print('agent-graph.html 生成')
