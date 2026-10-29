"""表格页：把 7 阶段 + 1 管理所设计的 13 张表，按阶段拆成页面。

为什么这些表要自己占页面，而不是把飞书链接贴上去：

飞书里那 13 张表是**给人录入用的**——空行、下拉框、视图筛选。而读它的人要回答的
是另一类问题：「验收这一列到底该填什么」「为什么交付要分呈现和报告」。这两个问题
在表格视图里都答不了，因为一张 13 列的表里，每一列的「怎么填 / 为什么 / 好例子 /
坏例子」没有地方放。

所以这一页的形状和飞书不同：**一行 = 一张表里的一条真实记录，但每个字段都展开**。
它既是字段说明，又是已填数据的样张。

不做的一件事：页面不算任何东西。数据全部来自 `docs/product/tables.json`，那份快照
由 `scripts/xref.mjs` 一起校验。页面里算一遍就会和快照分叉，而那是这个仓库反复在治的病。

页面一个 JS 都不带。所有内容在 HTML 里，筛选靠锚点。
"""
import html
import json
import os

from build_shell import page, STAGES
from paths import REPO, out_dir

# 哪张表属于哪个阶段。键是阶段 slug（和 build_shell.STAGES 一致），值是表名。
# 这张映射是站点唯一的归属声明；表名必须和 tables.json 的键逐字相同，否则
# `build_tables` 会直接报错而不是静默少一页——少一页的站点看起来是完整的。
STAGE_TABLES = {
    'need': ['01 需求', '01-1 能力清单'],
    'design': ['03-1 采集设计', '03-2 打标设计', '03-3 指标设计', '03-4 结论设计'],
    'build': ['04 开发'],
    'verify': ['05 验收'],
    'ship': ['06 交付'],
    'operate': ['07 运营'],
    'iterate': ['08 迭代', '10 回流（闭环）'],
    'manage': ['09 管理'],
}

# 每张表的一句话：它回答什么问题。写在这里而不是读表，因为表里没有这个字段——
# 而一张表如果说不清它回答什么，它就不该存在。
TABLE_ASK = {
    '01 需求': '这条需求为什么值得做，做完谁的日子好过了。',
    '01-1 能力清单': '这个需求拆成哪几项能力，谁先谁后。',
    '03-1 采集设计': '源、节奏、去重、时点——四件事定下来才能开工。',
    '03-2 打标设计': '标签分几档，多少分算合格，改标签时旧数据怎么办。',
    '03-3 指标设计': '一个指标要能被别人照着算出同一个数。',
    '03-4 结论设计': '结论要能被证伪，否则它是一句感想。',
    '04 开发': '这块做完了没有，以及「做完了」的判据是什么。',
    '05 验收': '这一条现在能不能被证明——一行是一次检查，不是一项能力。',
    '06 交付': '对方真的用起来了没有，不是我们发过去了没有。',
    '07 运营': '看什么信号，多久没动静算异常。',
    '08 迭代': '一次改动的全部后果：旧数据、下游、以及哪些旧结论失效了。',
    '09 管理': '这件事该记成哪种文件——ADR、事故、设计记录，还是票。',
    '10 回流（闭环）': '观察变成了什么决定，以及改完之后信号变没变。',
}

# 编号字段：渲染时当主键，排在最前并加粗。和 scripts/xref.mjs 的 ID_FIELD 同义，
# 但不共用——一个是 JS 一个是 Python，共用要引入解析器；重复一处比引入一个
# 跨语言解析器便宜。两边都有测试盯着各自的表名清单。
ID_FIELD = {
    '01 需求': '需求编号',
    '01-1 能力清单': '能力编号',
    '03-1 采集设计': '设计编号',
    '03-2 打标设计': '设计编号',
    '03-3 指标设计': '设计编号',
    '03-4 结论设计': '设计编号',
    '04 开发': '开发编号',
    '05 验收': '验收编号',
    '06 交付': '交付编号',
    '07 运营': '运营编号',
    '08 迭代': '迭代编号',
    '09 管理': '管理编号',
    '10 回流（闭环）': '回流编号',
}

# 每个阶段里，哪一列是这个阶段真正要问的那一个。
# 它决定样张先展示什么：一张 18 列的表如果按字段顺序排，最重要的那列可能排到第 12。
KEY_FIELD = {
    '01 需求': '要解决的问题',
    '01-1 能力清单': '能力名称',
    '03-1 采集设计': '拆成哪些模块',
    '03-2 打标设计': '多少分算合格',
    '03-3 指标设计': '怎么算的',
    '03-4 结论设计': '什么情况这条结论作废',
    '04 开发': '两次都能跑吗',
    '05 验收': '通过门槛',
    '06 交付': '不需要你在旁边吗',
    '07 运营': '多久没动静算异常',
    '08 迭代': '旧数据怎么办',
    '09 管理': '为什么是这一种，不是另外三种',
    '10 回流（闭环）': '不做什么',
}


# 索引行用哪个字段当摘要。按顺序找第一个非空的。
# 和 KEY_FIELD 分开，因为「这一列最重要」和「每一行都填了这一列」是两个要求，
# 而它们经常不重合：通过门槛最重要，但工作台那几条走的是另一套字段。
SUMMARY_FIELD = {
    '01 需求': ['要解决的问题', '产品名称'],
    '01-1 能力清单': ['能力名称'],
    '03-1 采集设计': ['这项能力'],
    '03-2 打标设计': ['这项能力'],
    '03-3 指标设计': ['指标叫什么', '这项能力'],
    '03-4 结论设计': ['结论是什么', '这项能力'],
    '04 开发': ['这个模块'],
    '05 验收': ['这一项验什么', '通过门槛'],
    '06 交付': ['交付的是什么', '推送到哪'],
    '07 运营': ['看的是什么'],
    '08 迭代': ['标题', '为什么现在改'],
    '09 管理': ['标题'],
    '10 回流（闭环）': ['这次要改什么', '观察到的形态'],
}


def load():
    with open(os.path.join(REPO, 'docs', 'product', 'tables.json'), encoding='utf-8') as fh:
        return json.load(fh)


def esc(v):
    return html.escape(str(v))


def br(v):
    """字段值里的换行保留成 <br>。多行字段（模块清单、未决问题）靠它可读。"""
    return esc(v).replace('\n', '<br>')


def short(v, n=42):
    s = str(v).replace('\n', ' ')
    return s if len(s) <= n else s[:n] + '…'


def table_page(name, rows, stage_label, stage_slug):
    """一张表 → 一段 HTML。它问什么、字段清单、以及每一条真实记录的展开。"""
    ask = TABLE_ASK.get(name, '')
    idf = ID_FIELD[name]

    b = [f'<h2 id="{esc(stage_slug)}-{esc(name).replace(" ", "-")}">{esc(name)}</h2>']
    if ask:
        b.append(f'<p class="lede" style="margin-bottom:1rem">{esc(ask)}</p>')

    if not rows:
        b.append('<div class="note warn"><b>这张表还是空的。</b>'
                 '空的表不是「还没轮到」，它是一个正在等的决定——'
                 '如果长期为空，应当问的是「这张表还要不要」。</div>')
        return ''.join(b)

    # 全表出现过哪些字段。不硬编码，因为各表列数不同，且新加的列要自动出现。
    fields = []
    for r in rows:
        for k in r:
            if k not in fields:
                fields.append(k)

    key = KEY_FIELD.get(name)
    if key in fields:
        fields.remove(key)
        fields.insert(0, key)

    # 索引行要展示的那个字段，和「主键字段」不是一回事。
    #
    # 05 验收的 KEY_FIELD 是「通过门槛」，但工作台那三条填的是「点下去该到哪」，
    # 没有通过门槛——于是索引上只剩编号，三条看起来一模一样。而它们其实很好区分。
    # 所以这里按行找第一个非空的有意义字段，找不到才退回编号。
    def headline(r):
        for f in SUMMARY_FIELD.get(name, []):
            v = r.get(f)
            if v not in (None, ''):
                return str(v)
        return ''
    if idf in fields:
        fields.remove(idf)
        fields.insert(0, idf)

    # 索引：让读者一眼看到这批记录有哪几条，而不是从头滚。
    b.append('<div class="tb-index">')
    for r in rows:
        anchor = f'{stage_slug}-{esc(r.get(idf, ""))}'
        b.append(f'<a href="#{anchor}"><code>{esc(r.get(idf, "?"))}</code> '
                 f'{esc(short(headline(r), 30))}</a>')
    b.append('</div>')

    b.append(f'<p class="h2sub">{len(rows)} 条记录、{len(fields)} 个字段。'
             f'每个字段下是这个值现在填的是什么；空着的字段也列出来，'
             f'因为「没填」和「不需要填」在表里长得一样，在这里必须能分开看。</p>')

    for r in rows:
        rid = r.get(idf, '?')
        b.append(f'<div class="tb-row" id="{stage_slug}-{esc(rid)}">')
        b.append(f'<h3><code>{esc(rid)}</code></h3>')
        b.append('<table class="tb-fields"><tbody>')
        for f in fields:
            v = r.get(f)
            filled = v not in (None, '')
            mark = '' if filled else ' class="tb-empty"'
            cell = br(v) if filled else '<span class="tb-no">（空）</span>'
            b.append(f'<tr{mark}><td>{esc(f)}</td><td>{cell}</td></tr>')
        b.append('</tbody></table>')
        b.append('</div>')

    return ''.join(b)


def stage_page(slug, label, oneline, tables, data):
    names = STAGE_TABLES.get(slug, [])
    b = [f'<h1>{esc(label)} <span style="font-size:.5em;color:var(--faint);'
         f'font-family:var(--sans);font-weight:400">{len(names)} 张表</span></h1>']
    b.append(f'<p class="lede">{esc(oneline)}</p>')

    missing = [n for n in names if n not in data]
    if missing:
        # 静默少一页的站点看起来是完整的。所以缺表直接写进页面正文，不吞掉。
        b.append('<div class="note warn"><b>数据里没有这几张表：</b>'
                 + '、'.join(esc(m) for m in missing)
                 + '。页面照常生成，但下面少的是内容，不是排版。</div>')

    b.append('<p style="font-size:.9rem;color:var(--faint)">这一页是<b>表的样张</b>，'
             '不是方法论。方法在'
             f'<a href="{slug}.html">{esc(label)}</a>那一页。'
             '两页读的是同一件事：一页讲这一步要问什么，一页讲答案记在哪一列。</p>')

    for name in names:
        if name in data:
            b.append(table_page(name, data[name], label, slug))

    others = [(s, l) for s, l, _ in STAGES if s != slug and STAGE_TABLES.get(s)]
    links = ' · '.join(
        f'<a href="tables-{s}.html">{esc(l)}</a>' for s, l in others)
    b.append(f'<div class="nextprev"><div><span class="lbl">其它阶段的表</span>{links}</div></div>')
    # 二级导航就是这几张表本身——这一页的内容形状就是「几张表依次展开」，
    # 所以小节天然等于表名，不需要另外起名字。
    sections = [(f'{slug}-{n.replace(" ", "-")}', n) for n in names]
    return page(f'tables-{slug}', f'{label} · 表', ''.join(b),
                crumb=f'表格 · <a href="tables.html">全部</a>',
                sections=sections)



def index_page(data):
    b = ['<h1>十三个表 <span style="font-size:.5em;color:var(--faint);font-family:var(--sans);'
         'font-weight:400">七个阶段 + 一个管理</span></h1>']
    b.append('<p class="lede">这套方法走到今天，每一步都要写下来一点东西。'
             '它们最后长成了十三张表——按阶段分，按层分，按它回答的问题分。</p>')

    b.append('<div class="note"><b>这一页为什么存在。</b>'
             '表在飞书里，能录入；但「这一列到底该填什么」在飞书的表格视图里没有地方放。'
             '所以这里的形状不一样：一行是表里一条真实记录，但每个字段都展开，'
             '空着的字段也列出来。<b>它既是字段说明，又是样张。</b></div>')

    total_rows = sum(len(v) for v in data.values())
    total_fields = 0
    for rows in data.values():
        fs = set()
        for r in rows:
            fs.update(r.keys())
        total_fields += len(fs)

    b.append('<div class="cover">'
             f'<div class="row"><span class="k">表</span><span class="v">{len(data)} 张</span></div>'
             f'<div class="row"><span class="k">记录</span><span class="v">{total_rows} 条（有真实内容的）</span></div>'
             f'<div class="row"><span class="k">字段</span><span class="v">合计 {total_fields} 个（有重复，各表不同）</span></div>'
             '<div class="row"><span class="k">数据来源</span><span class="v">'
             '<code>docs/product/tables.json</code>，由 <code>scripts/xref.mjs</code> 校验引用完整性</span></div>'
             '</div>')

    b.append('<h2>按阶段</h2>')
    b.append('<div class="grid two">')
    for slug, label, oneline in STAGES:
        names = STAGE_TABLES.get(slug, [])
        if not names:
            continue
        rows = sum(len(data.get(n, [])) for n in names)
        b.append(f'<a class="card" href="tables-{slug}.html" '
                 f'style="display:block;text-decoration:none;color:inherit">'
                 f'<h3>{esc(label)} <span style="font-weight:400;font-size:.82rem;'
                 f'color:var(--faint)">{len(names)} 表 · {rows} 条</span></h3>'
                 f'<p style="margin:0;font-size:.9rem;color:var(--muted)">{esc(oneline)}</p>'
                 '</a>')
    b.append('</div>')

    b.append('<h2>为什么交付和管理各有一张表，而需求有两张</h2>')
    b.append('<p>不是按「重要性」分的，是按<b>一行代表什么</b>分的。</p>')
    b.append('<table><thead><tr><th style="width:26%">表</th><th style="width:22%">一行是</th>'
             '<th>为什么必须单独一张</th></tr></thead><tbody>')
    b.append('<tr><td>01 需求</td><td>一条需求</td><td>一个产品解决多个问题</td></tr>')
    b.append('<tr><td>01-1 能力清单</td><td>一项能力</td><td>一条需求拆成多项能力，粒度差一层</td></tr>')
    b.append('<tr><td>05 验收</td><td><b>一次检查</b></td><td>同一项能力改一次就要重跑一次，'
             '以能力为行的表只能记住最后一次</td></tr>')
    b.append('<tr><td>07 运营</td><td><b>一个信号</b></td><td>「每天检查成功率」是动作，'
             '永远做不完；「连续两天为 0 且无告警」才有真假</td></tr>')
    b.append('<tr><td>10 回流</td><td><b>一次回流</b></td><td>唯一一张往回走的表：'
             '观察 → 决定 → 落回哪个寄存器</td></tr>')
    b.append('</tbody></table>')

    b.append('<h2>空着的地方</h2>')
    empties = []
    for name, rows in sorted(data.items()):
        idf = ID_FIELD.get(name)
        if not idf or not rows:
            continue
        for r in rows:
            for k, v in r.items():
                if k == idf:
                    continue
                if v in (None, ''):
                    empties.append((name, r.get(idf, '?'), k))
    if empties:
        b.append(f'<p>全表共 <b>{len(empties)}</b> 个空字段。它们不都是问题——'
                 '有些是「这一条不需要填」，有些是「还没人填」。'
                 '这个区分只有人能做出，所以这里只列出来，不替你判断。</p>')
        b.append('<table><thead><tr><th style="width:30%">表</th><th style="width:14%">记录</th>'
                 '<th>字段</th></tr></thead><tbody>')
        for name, rid, k in empties[:60]:
            b.append(f'<tr><td>{esc(name)}</td><td><code>{esc(rid)}</code></td><td>{esc(k)}</td></tr>')
        if len(empties) > 60:
            b.append(f'<tr><td colspan="3" style="color:var(--faint)">… 还有 {len(empties) - 60} 个</td></tr>')
        b.append('</tbody></table>')
    else:
        b.append('<p>没有空字段。</p>')

    return page('tables', '十三个表', ''.join(b), crumb='表格 · 全部')


if __name__ == '__main__':
    out = out_dir()
    data = load()

    known = set(data)
    declared = {n for names in STAGE_TABLES.values() for n in names}
    undeclared = known - declared
    if undeclared:
        raise SystemExit(f'这些表在 tables.json 里但没有归属阶段，会从站点上消失：{sorted(undeclared)}')

    with open(os.path.join(out, 'tables.html'), 'w', encoding='utf-8') as fh:
        fh.write(index_page(data))
    print('生成: tables.html')

    # 管理不在 STAGES 里——它是横跨七阶段的一层，不是第八步。所以这里要补上，
    # 否则「管理那一张表」会从站点上消失，而站点看起来是完整的。
    pages = [(slug, label, oneline) for slug, label, oneline in STAGES]
    pages.append(('manage', '管理', '横跨七阶段的记录层：每一种信息只有一个家'))

    for slug, label, oneline in pages:
        if not STAGE_TABLES.get(slug):
            continue
        with open(os.path.join(out, f'tables-{slug}.html'), 'w', encoding='utf-8') as fh:
            fh.write(stage_page(slug, label, oneline, STAGE_TABLES[slug], data))
        print(f'生成: tables-{slug}.html')

    # 归属声明与阶段列表必须一一对上。少一个 slug 就是一整张表没有页面，
    # 而「少一页」在生成的站点上和「本来就只有这些」看不出区别。
    covered = {slug for slug, _, _ in pages if STAGE_TABLES.get(slug)}
    declared = set(STAGE_TABLES)
    if covered != declared:
        raise SystemExit(f'STAGE_TABLES 里有 {sorted(declared - covered)} 没有对应的阶段页会被生成')
