import sys, os
from build_shell import page
from paths import out_dir

DOCS = [
 ('failure-atlas.html', '失败图鉴', '七种误判：四类来自系统的假信号，三类来自你自己读它的方式。全部来自真实运行。'),
 ('decision-tree.html', '决策树', '三个问题定位到你该在哪一步。含"怀疑有假信号"和"卡住了"两个额外入口。'),
 ('terms.html', '术语表', '每个技术词三栏：它在说什么、坏了会怎样、你怎么一眼看出来。'),
 ('capability-map.html', '能力图谱', '按六个能力域拆解一个真实 agent 产品：30 项能力、成熟度、以及逐条诊断。'),
 ('anb-proposal.html', '方案 v0', '这套方法最初的设计：问题、五条原则（每条挂一个真实事故）、六步闭环、三件套分工。'),
 ('atlas-test-report.html', '实测一：七个问句够不够', '用第一次实测检验七问句，发现它们漏了一整类：产出可用度。'),
 ('anb2-report.html', '实测二：用修正后的方法', '用补过的四条质量问句做第二个产品，发现"检查通过但理由错"这一层。'),
 ('anb2-full.html', '实测二：完整六步', '六步走完，三步没过。含观测污染、配额墙、以及阶段六规则被自己推翻。'),
]

def docs_page():
    b = ['<h1>原始文档</h1>']
    b.append('<p class="lede">八份 HTML，<b>未改一字</b>。它们是这套方法的原始产物，页面结构各不相同——因为写的时候是在解决具体问题，不是在设计一个站点。</p>')
    b.append('''<div class="note">这八份文档<b>不遵循本站的导航结构</b>，它们是独立的单页。你打开后会看到和下面列表不同的排版，这是有意的：
改它们会让「原文」变成「改编」，而这套方法的全部价值建立在可追溯上。<br><br>每份文档都在仓库里，路径见页脚。</div>''')

    b.append('<div class="grid two">')
    for fn, title, desc in DOCS:
        # id carries the filename so other pages can deep-link to a specific document
        b.append(f'<a class="card" id="{fn}" href="/mas_router_method/site/originals/{fn}" style="display:block;text-decoration:none;color:inherit">'
                 f'<h3 style="margin-top:0">{title} <span style="font-family:var(--mono);font-size:.74rem;color:var(--faint);font-weight:400">{fn}</span></h3>'
                 f'<p style="margin:0;font-size:.9rem;color:var(--muted)">{desc}</p></a>')
    b.append('</div>')

    b.append('<h2>它们之间的关系</h2>')
    b.append('<table><thead><tr><th style="width:26%">文档</th><th>在这套方法里的角色</th></tr></thead><tbody>'
             '<tr><td>能力图谱</td><td><b>诊断</b>：一个真实项目的现状，用来证明这些假信号是真的，不是想出来的。</td></tr>'
             '<tr><td>失败图鉴</td><td><b>核心</b>：七种误判 + 七问句 + 四质量问句 + 读信号规则。这是整套方法最该读的一页。</td></tr>'
             '<tr><td>决策树</td><td><b>导航</b>：不知道下一步时用。本网站的七个阶段页是它的展开版。</td></tr>'
             '<tr><td>术语表</td><td><b>翻译</b>：把技术词翻成"坏了会怎样"。第三栏才是给人用的。</td></tr>'
             '<tr><td>方案 v0</td><td><b>原始设计</b>：六步闭环的初版。本站的七阶段是在它基础上补了「设计」和「运营」。</td></tr>'
             '<tr><td>实测一</td><td><b>自我检验</b>：用自己的方法检查自己，发现七问句漏了一类。</td></tr>'
             '<tr><td>实测二（报告）</td><td><b>修正验证</b>：补齐后再做一次，发现补得对，但仍有一层漏。</td></tr>'
             '<tr><td>实测二（完整）</td><td><b>走完全程</b>：六步都做了，三步的验收做不到，如实记录。</td></tr>'
             '</tbody></table>')
    return page('docs', '原始文档', '\n'.join(b), '<a href="/mas_router_method/site/">总览</a> / 原始文档')

if __name__ == '__main__':
    # 原件是仓库里的源文件（docs/site/originals/），不是生成物，所以这里不复制任何东西。
    # 早先版本把它们复制到 out/docs/ —— 那是更早一套嵌套布局留下的废弃步骤。
    open(os.path.join(out_dir(), 'docs.html'), 'w', encoding='utf-8').write(docs_page())
    print('docs.html 生成')
