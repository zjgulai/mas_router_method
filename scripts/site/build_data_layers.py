import sys, os
from build_shell import page
from paths import out_dir

def data_layers_page():
    b = ['<h1>8+3 层级契约与检查器</h1>']
    b.append('<p class="lede">数据产品的八个工序层（采集、存储、打标、指标、分析、呈现、结论、报告）'
             '与三个横切义务柱（口径、质量、血缘）。'
             '<b>每一层要么有一个可执行的命令级检查器，要么它只是一句愿望。</b></p>')

    b.append('''<div class="note"><b>三条不变量铁律：</b><br>
1. <code>first_seen_at</code> 不是可被修改的列，而是读侧计算的 <code>min()</code>——历史不可改写。<br>
2. 空抓必须留存显式日志记录——区分「数据为空」与「抓取失败」。<br>
3. 数据迁移是读侧的（追加 migration 规则）——旧数据永远保持原样可查。</div>''')

    b.append('<h2 id="invariants">一、链 A：采集与存储的基础契约</h2>')
    invariants = [
        ('采集层 (Collection)',
         'Apify actor / 第三方 API 原始返回',
         '{raw, first_seen_at, fetched_at, source_task_id, schema_version, taxonomy_version, metric_version}',
         '时滞跨区域不一致；抓取时点缺失；空抓不记录',
         '<code>collect-audit</code> (0=通过 / 1=失败 / 2=无法判断)'),
        ('存储层 (Storage)',
         '采集层适配器输出的标准观察记录',
         '按条目单行归档：first_seen_at 为最早一次，raw 为最新一次，保留所有历史原始快照',
         'first_seen_at 被重跑覆盖；字段迁移后旧版本数据无法读取',
         '<code>collect-store verify</code> (0=不变量成立 / 1=有结构性破坏)'),
    ]
    b.append('<table><thead><tr><th style="width:18%">层级</th><th style="width:20%">输入契约</th><th style="width:24%">输出契约</th><th style="width:22%">失败模式</th><th>检查命令</th></tr></thead><tbody>'
             + ''.join(f'<tr><td><b>{name}</b></td><td>{inp}</td><td>{out}</td><td>{fail}</td><td>{cmd}</td></tr>' for name, inp, out, fail, cmd in invariants)
             + '</tbody></table>')

    b.append('<h2 id="all-layers">二、八层完整契约大表</h2>')
    layers = [
        ('打标层', '清洗后的文本载荷与媒体元数据', '多维度标签值、置信度分数、taxonomy_version', '模型漂移导致打标标准不一致；Kappa 一致性不足', '<code>label-audit</code>'),
        ('指标层', '明细数据与标注结果', '规范化聚合指标、统计口径版本、计算周期', '分子分母口径漂移；时间区间对不齐；缺失值填充错误', '<code>metric-card check</code>'),
        ('分析层', '指标时间序列与控制变量面板', '回归弹性系数、置信区间、诊断统计量', '共线性过高；伪相关未剔除；置信区间跨 0 仍下结论', '<code>panel-fit</code>'),
        ('呈现层', '分析模型输出与指标汇总', '支持按维度下钻的可视化视图、明确标注的数据三态', '图表截断坐标轴；空状态与错误状态混淆', '<code>ui-render-test</code>'),
        ('结论层', '分析结果与业务事实', '六项结论卡（主张、依据、区间、动作、证伪条件、失效期）', '主张无法被证伪；写出无动作含义的纯陈述', '<code>verify-conclusion</code>'),
        ('报告层', '结构化结论卡集合', '面向决策者的定期汇报文档或告警推送', '未触发证伪告警；结论失效后未同步下线', '<code>report-audit</code>'),
    ]
    b.append('<table><thead><tr><th style="width:12%">层级</th><th style="width:24%">输入契约</th><th style="width:24%">输出契约</th><th style="width:24%">典型失败模式</th><th>检查器</th></tr></thead><tbody>'
             + ''.join(f'<tr><td><b>{name}</b></td><td>{inp}</td><td>{out}</td><td>{fail}</td><td>{chk}</td></tr>' for name, inp, out, fail, chk in layers)
             + '</tbody></table>')

    b.append('<h2 id="pillars">三、横切三柱的每层义务</h2>')
    pillars = [
        ('口径 (Definition)', '每个数字的公式、时间窗、分子分母、异常值处理必须单一来源定义，修改必须升版本号。'),
        ('质量 (Quality)', '必须能够区分真实 0、抓取失败、未到抓取周期三态，不允许静默填补假数据。'),
        ('血缘 (Lineage)', '任意一个报表上的数字，必须能够无歧义地回溯到对应的原始数据快照与处理代码版本。'),
    ]
    b.append('<div class="grid three">'
             + ''.join(f'<div class="card" id="pillar-{i+1}"><h3>{title}</h3><p style="margin:0;font-size:.88rem;color:var(--muted)">{desc}</p></div>' for i, (title, desc) in enumerate(pillars))
             + '</div>')

    b.append('<h2 id="next">四、前往相关页面</h2>')
    b.append('<ul>'
             '<li>在 <a href="matrix.html">数据矩阵</a> 中查看 8×8 状态与检查器落地情况。</li>'
             '<li>在 <a href="data-design.html">数据产品设计</a> 中查看 Momcozy 归因方案的完整实战。</li>'
             '<li>在 <a href="agent-graph.html">Agent 图谱</a> 中查看 Main Agent 如何对 8 层进行智能咨询分诊。</li>'
             '</ul>')

    sections = [
        ('invariants', '基础存储不变量'),
        ('all-layers', '八层完整契约'),
        ('pillars', '横切三柱义务'),
        ('next', '相关页面'),
    ]
    return page('data-layers', '8+3 层级契约', '\n'.join(b), '<a href="./">总览</a> / 8+3 层级契约', sections=sections)

if __name__ == '__main__':
    open(os.path.join(out_dir(), 'data-layers.html'), 'w', encoding='utf-8').write(data_layers_page())
    print('data-layers.html 生成')
