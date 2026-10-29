"""共享外壳：样式、导航、页脚。每个页面都从这里生成，避免重复。

阶段列表**不在这里写死**。它从 work/schema.yml 读，经 schema.mjs 的 CLI。
写死在这里就会过时，而且已经过时过一次：插入设计阶段时站点被重编号，
skill 没跟上，于是出现了「不要做验收」这种反向指令——而验收是唯一的门。

站点显示用的编号由这里的下标算出（见 build_pages.py），从不手写。
"""
import json, os, re, subprocess
from paths import REPO


def _load_stages():
    out = subprocess.run(
        ['node', os.path.join(REPO, 'scripts', 'schema.mjs'), 'stages', '--json'],
        capture_output=True, text=True, check=True)
    return [(x['id'], x['label'], x['oneline']) for x in json.loads(out.stdout)]


# (slug, 中文名, 一句话)。slug 就是阶段 id，不含编号——编号是位置，不是名字。
STAGES = _load_stages()

CSS = """
  :root{
    color-scheme:light;
    --ground:#f2f1ec;--surface:#fbfaf6;--sunk:#e7e6df;--deep:#d6d5cc;
    --ink:#191a17;--muted:#54564f;--faint:#5f6159;
    --accent:#0d5a51;--accent2:#d9e6e2;
    --alert:#782c2c;--alert2:#eedcd8;
    --warn:#6b5312;--warn2:#f0e8d2;
    --sans:ui-sans-serif,-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif;
    --serif:ui-serif,Georgia,"Songti SC","Source Han Serif SC","Noto Serif CJK SC",serif;
    --mono:ui-monospace,SFMono-Regular,Menlo,monospace;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--ground);color:var(--ink);font:16.5px/1.64 var(--sans);-webkit-font-smoothing:antialiased}
  a{color:var(--accent)}
  /* ── 左栏布局 ──────────────────────────────────────────────────────
     左栏是「你在哪」和「还能去哪」，右栏是「这一页」。两件事分开之后，
     右栏可以专心排版内容，不必在顶部为导航留一条横带。 */
  .layout{display:grid;grid-template-columns:232px minmax(0,1fr);min-height:100vh}
  .side{background:var(--ink);color:#e9e7e0;position:sticky;top:0;height:100vh;overflow-y:auto;
        padding:1.1rem 0 2rem}
  .side details{display:block}
  .side summary{list-style:none;cursor:default}
  .side summary::-webkit-details-marker{display:none}
  .nav-toggle{display:none}
  .brand{display:block;padding:0 .9rem 1rem;border-bottom:1px solid #33352f;margin-bottom:.7rem}
  .brand .home{display:flex;align-items:center;min-height:26px;color:#f2f1ec;text-decoration:none;
               font:650 1.15rem/1.2 var(--serif);letter-spacing:-.02em}
  .brand-sub{display:block;font-size:.68rem;color:#8d8f86;letter-spacing:.04em;margin-top:.2rem}
  .nav{padding:0 .5rem}
  .nav-g{margin-bottom:.9rem}
  .nav-h{display:block;font-size:.66rem;letter-spacing:.13em;color:#8f9188;padding:.2rem .62rem .3rem;
         text-transform:uppercase}
  .nav a{display:block;color:#c9c7bf;text-decoration:none;font-size:.845rem;padding:.3rem .62rem;
         border-radius:2px;line-height:1.35}
  .nav a:hover{background:#2a2c26;color:#fff}
  .nav a.on{background:#f2f1ec;color:var(--ink);font-weight:640}
  .subnav{border-top:1px solid #33352f;margin:.4rem .9rem 0;padding-top:.7rem}
  .sub-h{display:block;font-size:.66rem;letter-spacing:.13em;color:#8f9188;margin-bottom:.3rem}
  .subnav a{display:block;color:#a9a79f;text-decoration:none;font-size:.79rem;
            padding:.3rem 0 .3rem .55rem;
            border-left:1px solid #3d3f38;line-height:1.35}
  .subnav a:hover{color:#fff;border-left-color:#8d8f86}
  .content{display:flex;flex-direction:column;min-width:0}
  .content main{flex:1;padding:clamp(2rem,4vw,3.2rem) clamp(16px,4vw,52px) 4rem;
                max-width:min(56rem,100%)}
  .content footer{margin:0 clamp(16px,4vw,52px) 0;padding:1.1rem 1.3rem;background:var(--sunk);
                  font-size:.8rem;color:var(--muted);line-height:1.7;max-width:min(56rem,100%)}

  /* 窄屏：左栏收到顶部，用 <details> 自带的开合。禁用 JS 时它默认展开，
     退化成一张普通的纵向导航列表——内容一个不少。 */
  @media(max-width:760px){
    .layout{grid-template-columns:1fr}
    .side{position:static;height:auto;padding:.6rem 0}
    .side summary{cursor:pointer;padding-right:1.1rem}
    .nav-toggle::after{content:' ▾';color:#8d8f86}
    .nav-toggle{display:block}
    .brand{padding-bottom:.7rem;margin-bottom:0;border-bottom:0}
    .nav,.subnav{margin-top:.4rem}
  }
  .crumb{font-size:.82rem;color:var(--faint);margin-bottom:.6rem}
  .crumb a{text-decoration:none;border-bottom:1px solid var(--deep)}
  h1{font-family:var(--serif);font-weight:600;letter-spacing:-.022em;line-height:1.06;font-size:clamp(1.8rem,4.6vw,2.8rem);margin:0 0 .7rem}
  h1 .num{color:var(--accent);margin-right:.5rem}
  .lede{font-size:clamp(1rem,1.7vw,1.14rem);color:var(--muted);max-width:44rem;margin:0 0 1.6rem;line-height:1.6}
  .lede strong{color:var(--ink)}
  h2{font-family:var(--serif);font-size:clamp(1.25rem,2.6vw,1.62rem);font-weight:600;letter-spacing:-.018em;margin:2.4rem 0 .3rem}
  h2:first-of-type{margin-top:1.4rem}
  .h2sub{font-size:.9rem;color:var(--faint);margin:0 0 1rem;max-width:42rem}
  h3{font-size:1.02rem;font-weight:650;margin:1.8rem 0 .5rem}
  p{margin:0 0 .9rem}
  code{font-family:var(--mono);font-size:.86em;background:var(--sunk);padding:.05em .3em}
  pre{margin:.6rem 0;background:#20211d;color:#e6e4dc;padding:.8rem 1rem;overflow-x:auto;font-family:var(--mono);font-size:.79rem;line-height:1.55}
  .card{background:var(--surface);padding:1.3rem 1.4rem 1.4rem;margin-bottom:1px}
  .card h3{margin-top:0}
  .grid{display:grid;gap:1px;background:var(--deep)}
  .grid.two{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
  .grid.three{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
  table{border-collapse:collapse;width:100%;background:var(--surface);margin:.4rem 0 0}
  .tablewrap{overflow-x:auto;max-width:100%}
  thead th{font-size:.76rem;font-weight:650;color:var(--faint);text-align:left;padding:.7rem .8rem .58rem;border-bottom:1px solid var(--deep);letter-spacing:.02em}
  tbody td{font-size:.87rem;color:var(--muted);padding:.66rem .8rem;border-bottom:1px solid var(--sunk);vertical-align:top}
  tbody tr:last-child td{border-bottom:0}
  tbody td:first-child{color:var(--ink);font-weight:600}
  .tag{display:inline-block;font-size:.72rem;font-weight:650;padding:.08rem .4rem;margin-right:.25rem;white-space:nowrap}
  .t-must{background:var(--accent2);color:var(--accent)}
  .t-branch{background:var(--warn2);color:var(--warn)}
  .t-alert{background:var(--alert2);color:var(--alert)}
  .t-plain{background:var(--sunk);color:var(--muted)}
  .t-gap{background:var(--alert2);color:var(--alert)}
  .note{background:var(--surface);padding:1.1rem 1.3rem;border-left:3px solid var(--accent);margin:1rem 0;font-size:.93rem;color:var(--muted)}
  .note.warn{border-left-color:var(--alert);background:var(--alert2);color:#4a1e1e}
  .note.warn b{color:#2e1111}
  .note b{color:var(--ink)}
  .cover{background:var(--surface);padding:1.2rem 1.4rem;margin:1rem 0}
  .cover .row{display:flex;gap:.8rem;align-items:baseline;flex-wrap:wrap;font-size:.9rem;color:var(--muted);padding:.35rem 0;border-bottom:1px solid var(--sunk)}
  .cover .row:last-child{border:0}
  .cover .k{flex:0 0 7rem;color:var(--faint);font-size:.82rem}
  .cover .v{flex:1;min-width:200px}
  .nextprev{display:flex;justify-content:space-between;gap:1rem;margin-top:3rem;padding-top:1.2rem;border-top:1px solid var(--deep);font-size:.9rem}
  .nextprev a{text-decoration:none}
  .nextprev .lbl{display:block;font-size:.76rem;color:var(--faint)}
  footer{margin-top:3rem;padding:1.1rem 1.3rem;background:var(--sunk);font-size:.8rem;color:var(--muted);line-height:1.7}
  footer code{background:transparent;padding:0}
  ul,ol{padding-left:1.2rem;margin:.4rem 0 .9rem}
  li{margin-bottom:.35rem;font-size:.93rem;color:var(--muted)}
  li b{color:var(--ink)}
  /* 表格页：一行 = 一条记录，字段全部展开。 */
  .tb-index{background:var(--surface);padding:.75rem .9rem;margin:1rem 0 1.2rem;font-size:.86rem}
  .tb-index a{display:flex;gap:.7rem;align-items:baseline;text-decoration:none;color:var(--muted);
    padding:.22rem 0;border-bottom:1px solid var(--sunk)}
  .tb-index a:last-child{border-bottom:0}
  .tb-index a:hover{color:var(--accent)}
  .tb-index a:hover code{background:var(--accent)}
  .tb-index code{background:transparent;padding:0;color:var(--accent);font-weight:650;
    flex:0 0 4.6rem;border-bottom:1px solid var(--deep)}
  .tb-row{margin:1.6rem 0 2rem}
  .tb-row h3{margin:0 0 .5rem;font-family:var(--mono);font-size:.92rem}
  .tb-row h3 code{background:var(--ink);color:var(--surface);padding:.1rem .45rem;font-size:.86rem}
  table.tb-fields{margin:0}
  table.tb-fields td{border-bottom:1px solid var(--sunk);vertical-align:top}
  table.tb-fields td:first-child{width:9.5rem;color:var(--faint);font-weight:600;font-size:.8rem}
  table.tb-fields td:last-child{font-size:.89rem;color:var(--ink)}
  table.tb-fields tr.tb-empty td:first-child{color:var(--deep)}
  .tb-no{color:var(--deep);font-style:italic}
  @media(max-width:620px){
    table.tb-fields td:first-child{width:6.5rem;font-size:.76rem}
  }
  @media print{
    body{background:#fff}.top{display:none}
    .card,.grid{break-inside:avoid}
    a{color:#000;text-decoration:none}
  }
"""

def nav_groups():
    """一级导航：两组。

    分组不是排版偏好。左边那组是**执行顺序**——你不知道下一步做什么时，按顺序往下走。
    右边那组是**查阅**——你带着一个具体问题来，顺序无关。

    这两组混成一个列表时，读者看不出「验收」和「十三个表」哪个是下一步。
    """
    return [
        ('流程', [('index', '总览')]
                  + [(s, n) for s, n, _ in STAGES]
                  + [('manage', '管理')]),
        ('查阅', [('agent-graph', 'Agent 图谱'), ('data-design', '数据产品设计'),
                  ('data-layers', '8+3 层契约'), ('branches', '分支总表'),
                  ('skills', 'Skill 全表'), ('prompts', '提示词'),
                  ('matrix', '数据矩阵'), ('tables', '十三个表'),
                  ('docs', '原始文档')]),
    ]


def _href(slug):
    # 站内链接一律相对当前页。站点同时要在 GitHub Pages 的子路径和
    # main.luteos.com 的根路径上工作，绝对前缀会让其中一个必坏。
    return './' if slug == 'index' else f'{slug}.html'


def nav(current_slug):
    out = []
    for group, items in nav_groups():
        out.append(f'<div class="nav-g"><span class="nav-h">{group}</span>')
        for slug, label in items:
            cls = ' class="on"' if slug == current_slug else ''
            out.append(f'<a href="{_href(slug)}"{cls}>{label}</a>')
        out.append('</div>')
    return "\n      ".join(out)


def subnav(sections, current_slug):
    """二级导航：本页小节。由页面自己声明，不自动抓 h2。

    自动抓看起来省事，但这些页面的 h2 锚点本来就不齐——有的带 id 有的不带，
    抓出来的二级导航会时有时无，那种「有时候有」的导航比没有更让人迷惑。
    """
    if not sections:
        return ''
    out = ['<div class="subnav"><span class="sub-h">本页</span>']
    for anchor, label in sections:
        out.append(f'<a href="#{anchor}">{label}</a>')
    out.append('</div>')
    return "\n      ".join(out)

def _wrap_tables(html):
    """宽表在窄屏上会让整页横向滚动；套一层容器让它自己滚，页面不动。

    生成器里每张表都手写包裹是一次性正确、永久易忘的做法——新加一张表的人
    不会记得。这里统一包，测试会盯着「窄屏下没有整页溢出」。
    """
    return re.sub(r'(<table\b.*?</table>)', r'<div class="tablewrap">\1</div>', html, flags=re.S)


def page(slug, title, body, crumb='', prevnext='', sections=None, desc=None):
    """整站外壳。左栏常驻，右栏是这一页。

    左侧边栏而不是顶栏，理由是这套文档的**深度**：七个阶段加一层管理，每一阶段
    自己还有小节（分支、怎么验、用到哪些 skill、原文）。顶栏塞不下两级，只能塞一级，
    于是二级要么被砍掉、要么摊在页面里让人滚回去找。左栏两级都放得下。

    移动端不用 JS 折叠：<details> 是浏览器自带的，禁用脚本时它的内容默认展开——
    也就是退化成没有折叠的普通列表，内容一个都不少。

    desc 缺省时用标题拼一句，保证每页都有 meta description；SEO 检查器会读它。
    """
    description = desc or f'{title} · Agent Native Builder：一套给不写代码的产品开发者用的 agent 产品方法。'
    # 内联 SVG favicon：站点零外部依赖，多一个文件就要在生成器里多一处拷贝。
    favicon = ("data:image/svg+xml,"
               "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E"
               "%3Crect width='64' height='64' fill='%23191a17'/%3E"
               "%3Ctext x='32' y='43' font-size='32' text-anchor='middle' fill='%23f2f1ec'"
               " font-family='Georgia,serif'%3EA%3C/text%3E%3C/svg%3E")
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} · Agent Native Builder</title>
<meta name="description" content="{description}">
<link rel="icon" href="{favicon}">
<style>{CSS}</style>
</head>
<body>
<div class="layout">
  <aside class="side">
    <div class="brand">
      <a class="home" href="{_href('index')}">ANB</a>
      <span class="brand-sub">Agent Native Builder</span>
    </div>
    <details open>
      <summary class="nav-toggle">导航</summary>
      <nav class="nav">
        {nav(slug)}
      </nav>
      {subnav(sections, slug)}
    </details>
  </aside>
  <div class="content">
    <main>
      {f'<div class="crumb">{crumb}</div>' if crumb else ''}
      {_wrap_tables(body)}
      {prevnext}
    </main>
    <footer>
      Agent Native Builder · 方法论、诊断与可运行样本 · 建站于 2026-10-24<br>
      这个站点的每一页都能在仓库里找到对应文件。原始文档未改一字，挂在 <a href="{_href('docs')}">原始文档</a>。
    </footer>
  </div>
</div>
</body>
</html>"""
