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
    /* 暖粉色品牌基底：暖雾粉、陶土深莓与温润黑檀 */
    --ground:#f7f1f2;--surface:#fcf8f9;--surface-elev:#ffffff;
    --sunk:#efe3e6;--deep:#d8c1c7;
    --ink:#211216;--muted:#4d3139;--faint:#6b4953;
    --accent:#8c2a4b;--accent-hover:#6b1d37;--accent2:#f4dce3;--accent-soft:#f9eef1;
    --alert:#8a1f24;--alert2:#f8dada;
    --warn:#6b460a;--warn2:#f5e6cc;
    --side-bg:#211015;--side-border:#3b2029;--side-text:#efe2e6;--side-muted:#b5949e;
    --sans:"PingFang SC","Hiragino Sans GB","Noto Sans CJK SC",-apple-system,BlinkMacSystemFont,"Microsoft YaHei",system-ui,sans-serif;
    --serif:"Source Han Serif SC","Noto Serif CJK SC","Songti SC",Georgia,ui-serif,serif;
    --mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
    --sp-1:4px;--sp-2:8px;--sp-3:12px;--sp-4:16px;--sp-5:24px;--sp-6:32px;--sp-8:48px;
  }
  *{box-sizing:border-box}
  ::selection{background:var(--accent2);color:var(--ink)}
  :focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  body{margin:0;background:var(--ground);color:var(--ink);font:16.5px/1.75 var(--sans);
       -webkit-font-smoothing:antialiased;accent-color:var(--accent)}
  a{color:var(--accent);text-underline-offset:.24em;text-decoration-color:var(--deep);transition:color .12s,text-decoration-color .12s}
  a:hover{color:var(--accent-hover);text-decoration-color:var(--accent)}
  /* ── 左栏布局 ──────────────────────────────────────────────────────
     左栏是「你在哪」和「还能去哪」，右栏是「这一页」。两件事分开之后，
     右栏可以专心排版内容，不必在顶部为导航留一条横带。 */
  .layout{display:grid;grid-template-columns:256px minmax(0,1fr);min-height:100vh}
  .side{background:var(--side-bg);color:var(--side-text);position:sticky;top:0;height:100vh;overflow-y:auto;
        padding:1.5rem 0 2.5rem;border-right:1px solid var(--side-border)}
  .side details{display:block}
  .side summary{list-style:none;cursor:default}
  .side summary::-webkit-details-marker{display:none}
  .nav-toggle{display:none;font-size:.82rem;color:var(--side-text);padding:.35rem .95rem}
  .brand{display:block;padding:0 1.25rem 1.25rem;border-bottom:1px solid var(--side-border);margin-bottom:1.1rem}
  .brand .home{display:flex;align-items:center;gap:.5rem;min-height:28px;color:#faf4f5;text-decoration:none;
               font:650 1.24rem/1.2 var(--serif);letter-spacing:-.02em}
  .brand .home::before{content:'';display:inline-block;width:8px;height:8px;background:#c45a7c;border-radius:1px}
  .brand-sub{display:block;font-size:.76rem;color:var(--side-muted);letter-spacing:.03em;margin-top:.32rem}
  .nav{padding:0 .75rem}
  .nav-g{margin-bottom:1.3rem}
  .nav-h{display:block;font-size:.76rem;font-weight:600;letter-spacing:.08em;color:var(--side-muted);
         padding:.3rem .75rem .42rem}
  .nav a{display:block;color:var(--side-text);text-decoration:none;font-size:.88rem;padding:.42rem .75rem;
         border-radius:3px;line-height:1.42;border-left:2px solid transparent}
  .nav a:hover{background:#301820;color:#fff}
  .nav a.on{background:var(--accent2);color:var(--ink);font-weight:650;border-left-color:var(--accent)}
  .subnav{border-top:1px solid var(--side-border);margin:.75rem 1.25rem 0;padding-top:1rem}
  .sub-h{display:block;font-size:.76rem;font-weight:600;letter-spacing:.08em;color:var(--side-muted);margin-bottom:.45rem}
  .subnav a{display:block;color:#d6bdc4;text-decoration:none;font-size:.83rem;
            padding:.38rem 0 .38rem .75rem;
            border-left:1px solid var(--side-border);line-height:1.42}
  .subnav a:hover{color:#fff;border-left-color:#c45a7c}
  .content{display:flex;flex-direction:column;min-width:0}
  .content main{flex:1;padding:clamp(2.8rem,4.8vw,4.5rem) clamp(24px,5vw,76px) 5.2rem;
                max-width:min(86rem,100%);width:100%}
  .content footer{margin:0 clamp(24px,5vw,76px) 0;padding:1.6rem 1.8rem;background:var(--sunk);
                  border-top:1px solid var(--deep);font-size:.84rem;color:var(--muted);line-height:1.78;max-width:min(86rem,100%)}

  /* 窄屏：左栏收到顶部，用 <details> 自带的开合。纯 CSS 几何箭头，禁用任何字符图标。 */
  @media(max-width:760px){
    .layout{grid-template-columns:1fr}
    .side{position:static;height:auto;padding:.7rem 0}
    .side summary{cursor:pointer;padding-right:1.1rem;display:flex;align-items:center;justify-content:space-between}
    .nav-toggle::after{content:'';display:inline-block;width:6px;height:6px;
                       border-right:1.5px solid var(--side-muted);border-bottom:1.5px solid var(--side-muted);
                       transform:rotate(45deg);margin-left:.4rem}
    .brand{padding-bottom:.7rem;margin-bottom:0;border-bottom:0}
    .nav,.subnav{margin-top:.45rem}
  }
  .crumb{font-size:.84rem;color:var(--faint);margin-bottom:1rem;font-variant-numeric:tabular-nums}
  .crumb a{text-decoration:none;border-bottom:1px solid var(--deep)}
  h1{font-family:var(--serif);font-weight:650;letter-spacing:-.022em;line-height:1.15;
     font-size:clamp(2rem,4.4vw,2.9rem);margin:0 0 1.05rem;text-wrap:balance;font-variant-numeric:tabular-nums}
  h1 .num{color:var(--accent);margin-right:.55rem;font-variant-numeric:tabular-nums}
  .lede{font-size:clamp(1.04rem,1.6vw,1.16rem);color:var(--muted);max-width:76ch;margin:0 0 2.3rem;line-height:1.76;text-wrap:pretty}
  .lede strong,.lede b{color:var(--ink)}
  h2{font-family:var(--serif);font-size:clamp(1.35rem,2.5vw,1.72rem);font-weight:650;letter-spacing:-.016em;
     margin:3.6rem 0 .65rem;text-wrap:balance;font-variant-numeric:tabular-nums}
  h2:first-of-type{margin-top:2.4rem}
  .h2sub{font-size:.95rem;color:var(--faint);margin:0 0 1.45rem;max-width:76ch;line-height:1.7}
  h3{font-size:1.06rem;font-weight:650;margin:2rem 0 .6rem;text-wrap:balance}
  p{margin:0 0 1.15rem;max-width:76ch;text-wrap:pretty}
  code{font-family:var(--mono);font-size:.86em;background:var(--sunk);color:var(--ink);padding:.12em .4em;border-radius:2px}
  pre{margin:1.1rem 0 1.5rem;background:#211015;color:#f3e6e9;padding:1.25rem 1.5rem;overflow-x:auto;
      font-family:var(--mono);font-size:.84rem;line-height:1.68;border:1px solid var(--side-border);border-radius:2px}
  .card{background:var(--surface);padding:1.65rem 1.85rem 1.7rem;border:1px solid var(--deep)}
  .card h3{margin-top:0}
  .card p{max-width:none;line-height:1.7}
  a.card{transition:border-color .14s,background-color .14s}
  a.card:hover{border-color:var(--accent);background:#fff}
  main>.card{margin:1.15rem 0}
  .grid{display:grid;gap:1.15rem;margin:1.25rem 0 1.8rem}
  .grid .card{margin:0}
  .grid.two{grid-template-columns:repeat(auto-fit,minmax(360px,1fr))}
  .grid.three{grid-template-columns:repeat(auto-fit,minmax(270px,1fr))}
  table{border-collapse:collapse;width:100%;background:var(--surface);margin:.85rem 0 1.6rem;
        border:1px solid var(--deep);font-variant-numeric:tabular-nums}
  .tablewrap{overflow-x:auto;max-width:100%}
  thead th{font-size:.82rem;font-weight:650;color:var(--muted);background:var(--accent-soft);
           text-align:left;padding:.95rem 1.2rem .85rem;border-bottom:1px solid var(--deep);letter-spacing:.02em}
  tbody td{font-size:.91rem;color:var(--muted);padding:.92rem 1.2rem;border-bottom:1px solid var(--sunk);vertical-align:top;line-height:1.68}
  tbody tr:last-child td{border-bottom:0}
  tbody tr:hover td{background:var(--accent-soft)}
  tbody td:first-child{color:var(--ink);font-weight:600}
  /* 窄屏：三列案例表改成一叠卡片，每格自带字段名，免得字被挤成竖条。 */
  @media(max-width:760px){
    table.cases-table{background:none;border:0}
    table.cases-table thead{display:none}
    table.cases-table,table.cases-table tbody,table.cases-table tr,table.cases-table td{display:block;width:auto}
    table.cases-table tr{background:var(--surface);border:1px solid var(--deep);padding:1rem 1.15rem 1.1rem;margin:0 0 .9rem}
    table.cases-table tr:hover td{background:transparent}
    table.cases-table td{border:0;padding:0;font-size:.92rem}
    table.cases-table td::before{content:attr(data-label);display:block;font-size:.74rem;font-weight:650;
                                 letter-spacing:.06em;color:var(--faint);margin:.8rem 0 .18rem}
    table.cases-table td:first-child{font-size:1.02rem;padding-bottom:.15rem}
    table.cases-table td:first-child::before{display:none}
  }
  .tag{display:inline-block;font-size:.76rem;font-weight:650;padding:.14rem .52rem;margin-right:.35rem;
       white-space:nowrap;border-radius:2px;font-variant-numeric:tabular-nums}
  .t-must{background:var(--accent2);color:var(--accent)}
  .t-branch{background:var(--warn2);color:var(--warn)}
  .t-pstack{background:#e8e0f2;color:#4a2c6b}
  .t-alert{background:var(--alert2);color:var(--alert)}
  .t-plain{background:var(--sunk);color:var(--muted)}
  .t-gap{background:var(--alert2);color:var(--alert)}
  /* 告别廉价的 3px 粗左边框套路，采用 1px 精密玫瑰陶框 + 浅雾粉底色 */
  .note{background:var(--accent-soft);padding:1.4rem 1.7rem;border:1px solid var(--deep);
        margin:1.6rem 0 2rem;font-size:.95rem;color:var(--muted);line-height:1.74}
  .note.warn{border-color:#d9a6a6;background:var(--alert2);color:#4a1818}
  .note.warn b{color:#2e0d0d}
  .note b{color:var(--ink)}
  .cover{background:var(--surface);border:1px solid var(--deep);padding:1.5rem 1.8rem;margin:1.6rem 0 2.2rem}
  .cover .row{display:flex;gap:1.25rem;align-items:baseline;flex-wrap:wrap;font-size:.94rem;color:var(--muted);
              padding:.6rem 0;border-bottom:1px solid var(--sunk);line-height:1.68}
  .cover .row:last-child{border:0}
  .cover .k{flex:0 0 8.5rem;color:var(--faint);font-size:.84rem;font-weight:600}
  .cover .v{flex:1;min-width:220px}
  .nextprev{display:flex;justify-content:space-between;gap:1.5rem;margin-top:4rem;padding-top:1.6rem;
            border-top:1px solid var(--deep);font-size:.94rem}
  .nextprev a{text-decoration:none;font-weight:600}
  .nextprev .lbl{display:block;font-size:.78rem;color:var(--faint);font-weight:400;margin-bottom:.2rem}
  footer{margin-top:3.5rem;padding:1.5rem 1.8rem;background:var(--sunk);font-size:.84rem;color:var(--muted);line-height:1.78}
  footer code{background:transparent;padding:0}
  ul,ol{padding-left:1.35rem;margin:.6rem 0 1.4rem}
  li{margin-bottom:.52rem;font-size:.95rem;color:var(--muted);line-height:1.72;max-width:76ch}
  li b{color:var(--ink)}
  /* 表格页：一行 = 一条记录，字段全部展开。空字段保持可读对比度 >= 4.5:1 */
  .tb-index{background:var(--surface);border:1px solid var(--deep);padding:1.15rem 1.45rem;margin:1.4rem 0 1.8rem;font-size:.9rem}
  .tb-index a{display:flex;gap:.9rem;align-items:baseline;text-decoration:none;color:var(--muted);
    padding:.42rem 0;border-bottom:1px solid var(--sunk)}
  .tb-index a:last-child{border-bottom:0}
  .tb-index a:hover{color:var(--accent)}
  .tb-index a:hover code{background:var(--accent);color:#fff}
  .tb-index code{background:var(--accent2);padding:.1rem .48rem;color:var(--accent);font-weight:650;
    flex:0 0 5.5rem;text-align:center}
  .tb-row{margin:2.4rem 0 2.8rem}
  .tb-row h3{margin:0 0 .7rem;font-family:var(--mono);font-size:.95rem}
  .tb-row h3 code{background:var(--accent);color:#fff;padding:.18rem .65rem;font-size:.88rem}
  table.tb-fields{margin:0}
  table.tb-fields td{border-bottom:1px solid var(--sunk);vertical-align:top}
  table.tb-fields td:first-child{width:12rem;color:var(--muted);font-weight:600;font-size:.84rem}
  table.tb-fields td:last-child{font-size:.92rem;color:var(--ink)}
  table.tb-fields tr.tb-empty td:first-child{color:var(--faint)}
  .tb-no{color:var(--faint);font-style:italic;font-size:.84rem}
  @media(max-width:620px){
    table.tb-fields td:first-child{width:7rem;font-size:.78rem}
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
        ('查阅', [('architecture', '架构全景'), ('cheatsheet', '作战手卡'), ('agent-graph', 'Agent 图谱'),
                  ('toolchain', '工具链'), ('practices', '实战用法'),
                  ('data-design', '数据产品设计'), ('data-layers', '8+3 层契约'),
                  ('branches', '分支总表'), ('skills', 'Skill 全表'),
                  ('prompts', '提示词'), ('matrix', '数据矩阵'),
                  ('tables', '十三个表'), ('docs', '原始文档')]),
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
    """二级导航：本页小节。由页面自己声明，不自动抓 h2。"""
    if not sections:
        return ''
    out = ['<div class="subnav"><span class="sub-h">本页</span>']
    for anchor, label in sections:
        out.append(f'<a href="#{anchor}">{label}</a>')
    out.append('</div>')
    return "\n      ".join(out)

def _wrap_tables(html):
    """宽表在窄屏上会让整页横向滚动；套一层容器让它自己滚，页面不动。"""
    return re.sub(r'(<table\b.*?</table>)', r'<div class="tablewrap">\1</div>', html, flags=re.S)


def page(slug, title, body, crumb='', prevnext='', sections=None, desc=None):
    """整站外壳。左栏常驻，右栏是这一页。"""
    description = desc or f'{title} · Agent Native Builder：一套给不写代码的产品开发者用的 agent 产品方法。'
    # 内联暖粉色品牌 SVG favicon：零外部依赖
    favicon = ("data:image/svg+xml,"
               "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E"
               "%3Crect width='64' height='64' rx='8' fill='%23211015'/%3E"
               "%3Ctext x='32' y='44' font-size='32' font-weight='700' text-anchor='middle' fill='%23f4dce3'"
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
      <summary class="nav-toggle">站点导航</summary>
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
