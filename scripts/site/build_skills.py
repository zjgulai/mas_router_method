import sys, os
from build_shell import page, STAGES
from map import MAP
from paths import out_dir, SKILLS

# 表里的行数，从归属表数出来：不在文档里写死数字，那是会过时的声明。
N_ROWS = len(MAP)

MODULES = list(STAGES) + [('manage', '管理', '横跨七阶段'),
                          ('data', '数据产品', '8 层 + 3 柱，与七阶段并行')]

_MODULE_LABELS = {label for _, label, _ in MODULES}
_bad = sorted({v[0] for v in MAP.values()} - _MODULE_LABELS)
if _bad:
    raise SystemExit(f'map.py assigns skills to modules that do not exist: {_bad}')

# 三层来源。
# pstack 也装在客户端插件里，但它是这一套方法的核心依赖，把它单列一层，
# 否则「客户端插件」那一格会把 67 个 skill 和 pstack 混成一句"要看运气"。
# 判据只有一处：map.py 里的 tag 带 'pstack'。不在第二个地方重复维护名单。
PSTACK = {k for k, v in MAP.items() if 'pstack' in v[1]}

repo_dirs = {d for d in os.listdir(SKILLS) if os.path.isdir(os.path.join(SKILLS, d))}
anb = {d for d in repo_dirs if d.startswith('anb')}
vendored = repo_dirs - anb

_unlisted = sorted(anb - set(MAP))
if _unlisted:
    raise SystemExit(f'these repo skills are in .claude/skills/ but not in map.py: {_unlisted}')

# 同名冲突：插件与仓库都提供 tdd / teach。仓库版本胜出，所以它们不进 pstack 那一层。
# 这条检查存在的理由：一个 skill 名在两处都有定义时，调用 /tdd 到底走哪一份是个
# 静默行为差异，而不是报错——没人会注意到自己在用另一套 TDD。
_shadowed = sorted(PSTACK & vendored)
if _shadowed:
    raise SystemExit(f'pstack skills shadow repo skills of the same name: {_shadowed}')

def source_of(name):
    if name in anb: return ('anb', '本方法新增')
    if name in vendored: return ('repo', '仓库自带')
    if name in PSTACK: return ('pstack', 'pstack 插件')
    return ('plugin', '客户端插件')

def skills_page():
    b = ['<h1>Skill 全表</h1>']
    b.append(f'<p class="lede">{N_ROWS} 个 skill，按八个模块归属（七阶段 + 管理）。每个都标注了来源、用在哪一步、以及<b>它坏了会怎样</b>，最后一项才是你真正要用的。</p>')

    b.append('''<div class="note warn"><b>先说清一件事：同一件事有三种"没有"。</b>
「<code>.claude/skills/</code> 里没有」不等于「不存在」，也不等于「你调不到」。这三个问题的解法完全不同。
<br><br>本页第三列标来源：<span class="tag t-must">仓库</span> 直接按名字调用；<span class="tag t-plain">插件</span> 调用时要带前缀，如 <code>anthropic-skills:agent-browser</code>；<span class="tag t-branch">ANB</span> 是本方法新增的。
<br><br>如果某个 skill 你调不到，正确结论是「我这台客户端没装这个插件」，不是「这个 skill 是假的」。</div>''')

    from collections import Counter
    per_stage = Counter(v[0] for v in MAP.values())
    b.append('<h2>按阶段分布</h2>')
    b.append('<div class="grid three">')
    for slug, sname, one in MODULES:
        LANDING = {'manage': 'manage.html',
                   'data': 'matrix.html'}
        href = LANDING.get(slug, f'{slug}.html#skills')
        b.append(f'<a class="card" href="{href}" style="display:block;text-decoration:none;color:inherit;padding:1rem 1.25rem">'
                 f'<div style="display:flex;justify-content:space-between;align-items:baseline">'
                 f'<span style="font-weight:650;font-size:.95rem;color:var(--ink)">{sname}</span>'
                 f'<span style="font-family:var(--mono);color:var(--accent);font-weight:700;font-size:1.1rem">{per_stage[sname]}</span>'
                 f'</div></a>')
    b.append('</div>')

    # 全表
    b.append(f'<h2>全部 {N_ROWS} 个</h2>')
    b.append('<p class="h2sub">按主归属模块排列，同模块内按名称。「坏了会怎样」写在最后一列。</p>')
    for slug, sname, one in MODULES:
        items = sorted([(k, v) for k, v in MAP.items() if v[0] == sname])
        if not items: continue
        head = f'{sname}'
        if slug == 'data':
            head = f'<a href="matrix.html" style="text-decoration:none">{sname}</a>'
        b.append(f'<h3>{head} <span style="color:var(--faint);font-weight:400;font-size:.85rem">（{len(items)}）</span></h3>')
        rows = []
        for name, (stage, tags, note) in items:
            src, label = source_of(name)
            cls = {'repo': 't-must', 'plugin': 't-plain', 'anb': 't-branch', 'pstack': 't-pstack'}[src]
            tagstr = ''.join(f'<span class="tag t-must">{t}</span>' for t in tags if t in ('必用', '硬门', '入口', '路由'))
            rows.append(f'<tr id="{name}"><td><code>{name}</code>{tagstr}</td>'
                        f'<td><span class="tag {cls}">{label}</span></td>'
                        f'<td>{note}</td></tr>')
        b.append('<table><thead><tr><th style="width:26%">Skill</th><th style="width:12%">来源</th><th>坏了会怎样 / 用在哪</th></tr></thead><tbody>'
                 + ''.join(rows) + '</tbody></table>')

    # 未安装的
    b.append('<h2>装了但没接进流程的</h2>')
    b.append('<p class="h2sub">这些在仓库里、能调用，但不在七阶段的任何一步上。它们不是没用，是还没找到位置。</p>')
    b.append('<p>见上表中标「（未安装）」的条目，以及 <code>ask-matt</code>、<code>wait-what</code>、<code>to-questionnaire</code>、<code>teach</code>、<code>wizard</code>、<code>writing-for-agents</code>。这几个的用途分别写在表里，但严格说它们服务于"怎么把话问清楚"，不专属于某一步。</p>')
    return page('skills', 'Skill 全表', '\n'.join(b), '<a href="./">总览</a> / Skill 全表')

def branches_page():
    b = ['<h1>分支总表</h1>']
    b.append('<p class="lede">所有判断集中一页，<b>按代价排序</b>：先做便宜、且能推翻结论的。</p>')
    b.append('<div class="note">这一页的用法：你不需要读完。找到一个和你处境相符的行，跳到对应处理。</div>')

    from build_pages import DETAIL
    for slug, name, one in STAGES:
        d = DETAIL[slug]
        b.append(f'<h2><a href="{slug}.html" style="text-decoration:none">{name}</a></h2>')
        rows = ''.join(f'<tr><td>{c}</td><td><a href="{slug}.html#{a.lstrip("#")}">{a.lstrip("#")}</a></td><td>{note}</td></tr>'
                       for c, a, note in d['branches'])
        b.append(f'<table><thead><tr><th style="width:40%">如果</th><th style="width:16%">处理</th><th>为什么</th></tr></thead><tbody>{rows}</tbody></table>')

    b.append('<h2><a href="manage.html" style="text-decoration:none">管理</a>'
             '<span style="font-size:.75rem;color:var(--faint);font-family:var(--sans);font-weight:400">'
             '　横跨以上全部，不是第八个阶段</span></h2>')
    b.append('<p class="h2sub">提问的对象是<b>项目自己的记录</b>而不是产品时，走这里。'
             '票据在需求时开，证据在验收时落，事故可能发生在任何一刻。</p>')
    mgmt = [
        ('你打算做一件事，而且不止这一次会话', '#m-file',
         '开一张票。一次会话内做完并验证的不要开，否则票据会变成流水账，流水账没人看。'),
        ('发生了一件你没计划的事', '#m-file',
         '那是事故，不是票。分开记，因为触发方式不同：票是你打算做，事故是发生了。'),
        ('文档里的数字和实际对不上', '#m-commands',
         '先跑 <code>facts</code>，再改文档。文档可能是对的，磁盘才是意外的那个。'),
        ('你记不清它现在是什么状态', '#m-status',
         '状态就是目录。<code>ls</code> 一次比回忆可靠，也比回忆便宜。'),
    ]
    mrows = ''.join(f'<tr><td>{c}</td><td><a href="manage.html{a}">{a}</a></td><td>{n}</td></tr>'
                    for c, a, n in mgmt)
    b.append(f'<table><thead><tr><th style="width:40%">如果</th><th style="width:16%">处理</th><th>为什么</th></tr></thead><tbody>{mrows}</tbody></table>')
    return page('branches', '分支总表', '\n'.join(b), '<a href="./">总览</a> / 分支总表')

if __name__ == '__main__':
    OUT = out_dir()
    open(os.path.join(OUT, 'skills.html'), 'w', encoding='utf-8').write(skills_page())
    open(os.path.join(OUT, 'branches.html'), 'w', encoding='utf-8').write(branches_page())
    print('skills + branches 生成完成')
