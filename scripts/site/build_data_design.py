import sys, os
from build_shell import page
from paths import out_dir

def data_design_page():
    b = ['<h1>数据产品设计：声量 → GMV 归因</h1>']
    b.append('<p class="lede">以 <b>Momcozy 区域声量归因</b> 为真实案例：'
             '如何用 8 层 + 3 柱方法论，将模糊的「看声量投广告」需求转化为可检验、可证伪、有置信区间的量化决策模型。</p>')

    b.append('''<div class="note warn"><b>设计顺序铁律：自顶向下（与建造顺序相反）。</b><br>
结论层 → 指标层 → 打标层 → 采集/存储 → 呈现/报告。<br>
理由来自试跑实测教训：自底向上建到一半才发现底层数据支撑不了上层决策，是数据产品最昂贵的死法。</div>''')

    b.append('<h2 id="discoveries">一、三个关键的前置发现</h2>')
    discoveries = [
        ('F1 缺少预算自变量', '决策是分配资源，但当前只有 GMV + 声量数据。', '能算出「声量 → GMV 弹性」，但算不出「预算 → 声量成本」。决策者拿到弹性依然不知道往哪投——因为弹性高可能获客成本极高。<b>解决：必须补齐按区域×渠道的花费数据才能做 C4 边际回报</b>。'),
        ('F2 面板固定效应吸收趋势', '声量与 GMV 均随时间上升，单序列必然产生 0.9 的假相关。', '决策单位是「区域」，问题转化为<b>区域 × 周的面板数据</b>。引入周固定效应整体吸收全球增长趋势与算法变动，识别变异集中在「同周内 A 区域声量超常增长是否带来 GMV 超常增长」。'),
        ('F3 全球效应不可识别', '周固定效应消除了伪相关，但也吸收了全球共性变化。', '一次全球品牌大事件或平台大促的影响无法被模型归因到特定区域声量上。这是模型的前提约束，必须在结论卡中明确声明。'),
    ]
    b.append('<div class="grid two">'
             + ''.join(f'<div class="card" id="f-{i+1}"><h3>{title}</h3><p style="font-size:.85rem;color:var(--alert);margin-bottom:.4rem"><b>痛点：</b>{issue}</p><p style="font-size:.88rem;color:var(--muted);margin:0">{sol}</p></div>' for i, (title, issue, sol) in enumerate(discoveries))
             + '</div>')

    b.append('<h2 id="conclusions">二、四级结论卡体系 (C1–C4)</h2>')
    b.append('<p class="h2sub">数据产品最终交付的是「结论」，而非裸数据看板。每条结论必须包含可证伪条件与动作建议。</p>')
    cards = [
        ('C1 基础关联与存在性', '区域声量与 GMV 之间是否存在统计显著的正向关联？', '弹性系数 β 估计值、95% 置信区间、样本量与观测周数', '当置信区间跨 0，或控制促销/缺货变量后 β 降为 0 时，本结论失效，停止归因。'),
        ('C2 时滞与衰减周期', '声量增长后，GMV 在第几周达到峰值？影响持续几周？', '滞后 1~4 周各期的弹性系数与脉冲响应曲线', '当滞后各期系数均无统计显著性时失效。'),
        ('C3 区域差异与弹性对比', '哪些区域属于「高声量敏感型」，哪些属于「低响应型」？', '分区域的弹性分档表（高/中/低）与基线规模对照', '当区域分类在连续两季度波动变动超过 50% 时失效。'),
        ('C4 预算边际回报决策', '在各区域追加 1 万元预算，预计分别能撬动多少增量 GMV？', '区域边际投入产出比（ROI）与推荐预算增减分配比例', '当未获得各区域真实获客成本/投放花费数据时，C4 不做产出。'),
    ]
    b.append('<table><thead><tr><th style="width:22%">结论层级</th><th style="width:30%">回答的商业问题</th><th style="width:24%">交付物与指标</th><th>失效与证伪条件</th></tr></thead><tbody>'
             + ''.join(f'<tr><td><b>{lvl}</b></td><td>{q}</td><td>{out}</td><td>{fals}</td></tr>' for lvl, q, out, fals in cards)
             + '</tbody></table>')

    b.append('<h2 id="model">三、计量模型与识别策略</h2>')
    b.append('<p>为剔除季节性与全球大盘趋势干扰，模型采用双向固定效应面板回归：</p>')
    b.append('<pre>ln(GMV)_{r,t} = β · ln(声量)_{r,t-k}\n              + 区域固定效应 α_r        ← 吸收区域规模、成熟度与基线差异\n              + 周固定效应   λ_t        ← 吸收全球大盘趋势、季节性与平台算法变动\n              + 控制变量     X_{r,t}    ← 促销折扣、价格变动、断货天数、竞品大促\n              + ε_{r,t}\n</pre>')

    b.append('<h2 id="links">四、关联与下钻</h2>')
    b.append('<ul>'
             '<li>在 <a href="matrix.html">数据矩阵 (8×8)</a> 中查看各阶段与各层级的检查状态。</li>'
             '<li>在 <a href="data-layers.html">8+3 层级契约</a> 中查看采集/存储/打标/指标的具体输入输出规范。</li>'
             '<li>在 <a href="tables-design.html">设计阶段样张</a> 中查看采集、打标、指标、结论设计的真实多维表格。</li>'
             '</ul>')

    sections = [
        ('discoveries', '前置发现'),
        ('conclusions', '四级结论卡'),
        ('model', '计量识别模型'),
        ('links', '关联与下钻'),
    ]
    return page('data-design', '数据产品设计', '\n'.join(b), '<a href="./">总览</a> / 数据产品设计', sections=sections)

if __name__ == '__main__':
    open(os.path.join(out_dir(), 'data-design.html'), 'w', encoding='utf-8').write(data_design_page())
    print('data-design.html 生成')
