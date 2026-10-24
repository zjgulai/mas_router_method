"""共享外壳：样式、导航、页脚。每个页面都从这里生成，避免重复。"""

STAGES = [
    ('01-need',      '需求', '把一句话想法变成可验收的意图'),
    ('02-design',    '设计', '定契约、边界、数据与决策记录'),
    ('03-build',     '开发', '一条真实输入走通，且不是假的'),
    ('04-verify',    '验收', '什么算好，而且检查必须能失败'),
    ('05-ship',      '交付', '别人能打开、能用，不需要你在旁边'),
    ('06-operate',   '运营', '看得出它有没有被用、有没有变好'),
    ('07-iterate',   '迭代', '只留下真的用过的，改掉真的错的'),
]

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
  .shell{max-width:1080px;margin:0 auto;padding:0 clamp(16px,4vw,48px)}
  .top{position:sticky;top:0;z-index:20;background:var(--ink);color:#e9e7e0;padding:.55rem 0}
  .top .shell{display:flex;align-items:center;gap:1rem;flex-wrap:wrap}
  .top a{color:#e9e7e0;text-decoration:none;font-size:.84rem;opacity:.78}
  .top a:hover{opacity:1}
  .top a.home{font-weight:650;opacity:1;font-family:var(--serif);font-size:.92rem}
  .top nav{display:flex;gap:.2rem;flex-wrap:wrap;margin-left:auto}
  .top nav a{padding:.2rem .5rem}
  .top nav a.on{background:#e9e7e0;color:var(--ink);opacity:1}
  main{padding:clamp(2rem,4.5vw,3.4rem) 0 4rem}
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
  @media print{
    body{background:#fff}.top{display:none}
    .card,.grid{break-inside:avoid}
    a{color:#000;text-decoration:none}
  }
"""

def nav(current_slug):
    items = [('index','总览')] + [(s, n) for s, n, _ in STAGES] + [
        ('manage','管理'), ('branches','分支'), ('skills','Skill 全表'),
        ('prompts','提示词'), ('docs','原始文档'),
    ]
    out = []
    for slug, label in items:
        cls = ' class="on"' if slug == current_slug else ''
        out.append(f'<a href="/mas_router_method/site/{"" if slug=="index" else slug + ".html"}"{cls}>{label}</a>')
    return '\n      '.join(out)

def page(slug, title, body, crumb='', prevnext=''):
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} · Agent Native Builder</title>
<style>{CSS}</style>
</head>
<body>
<header class="top"><div class="shell">
  <a class="home" href="/mas_router_method/site/">ANB</a>
  <nav>
      {nav(slug)}
  </nav>
</div></header>
<main class="shell">
  {f'<div class="crumb">{crumb}</div>' if crumb else ''}
  {body}
  {prevnext}
</main>
<div class="shell"><footer>
  Agent Native Builder · 方法论、诊断与可运行样本 · 建站于 2026-10-24<br>
  这个站点的每一页都能在仓库里找到对应文件。原始文档未改一字，挂在 <a href="/mas_router_method/site/docs.html">原始文档</a>。
</footer></div>
</body>
</html>"""
