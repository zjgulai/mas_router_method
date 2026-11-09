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
    /* 一套字号阶梯：标签 / 元信息 / 导航 / 正文 / 导语 / 三级标题 / 二级标题 / 一级标题。
       正文 17px，标题用衬线体拉开层级，导航比正文小一档半。 */
    --fs-label:.72rem;--fs-meta:.84rem;--fs-nav:.93rem;--fs-body:1.0625rem;
    --fs-lead:clamp(1.12rem,1.5vw,1.2rem);--fs-h3:1.15rem;
    --fs-h2:clamp(1.45rem,2.5vw,1.88rem);--fs-h1:clamp(2.15rem,4.5vw,3.05rem);
  }
  *{box-sizing:border-box}
  ::selection{background:var(--accent2);color:var(--ink)}
  :focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  /* 跳过导航：读屏/键盘用户第一个 Tab 停这里，回车直达正文，不必穿过 20+ 条链接。
     平时移出视口，获得焦点时才现身——它只为需要它的人出现。 */
  .skip{position:absolute;left:-9999px;top:0;z-index:100;
        background:var(--accent);color:#fff;font-size:var(--fs-nav);font-weight:650;
        padding:.6rem 1.1rem;border-radius:0 0 3px 0;text-decoration:none}
  .skip:focus{left:0}
  body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--sans);
       font-size:var(--fs-body);line-height:1.8;font-weight:400;
       -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;accent-color:var(--accent)}
  a{color:var(--accent);text-underline-offset:.24em;text-decoration-color:var(--deep);transition:color .12s,text-decoration-color .12s}
  a:hover{color:var(--accent-hover);text-decoration-color:var(--accent)}
  /* ── 左栏布局 ──────────────────────────────────────────────────────
     左栏是「你在哪」和「还能去哪」，右栏是「这一页」。两件事分开之后，
     右栏可以专心排版内容，不必在顶部为导航留一条横带。 */
  .layout{display:grid;grid-template-columns:268px minmax(0,1fr);min-height:100vh}
  .side{background:var(--side-bg);color:var(--side-text);position:sticky;top:0;height:100vh;overflow-y:auto;
        padding:1.5rem 0 2.5rem;border-right:1px solid var(--side-border)}
  .side details{display:block}
  .side summary{list-style:none;cursor:default}
  .side summary::-webkit-details-marker{display:none}
  .nav-toggle{display:none;font-size:.82rem;color:var(--side-text);padding:.35rem .95rem}
  .brand{display:block;padding:0 1.3rem 1.3rem;border-bottom:1px solid var(--side-border);margin-bottom:1.2rem}
  .brand .home{display:flex;align-items:center;gap:.55rem;min-height:30px;color:#faf4f5;text-decoration:none;
               font:700 1.32rem/1.15 var(--serif);letter-spacing:-.015em}
  .brand .home::before{content:'';display:inline-block;width:9px;height:9px;background:#c45a7c;border-radius:1px}
  .brand-sub{display:block;font-size:var(--fs-meta);color:var(--side-muted);letter-spacing:.04em;margin-top:.38rem}
  .nav{padding:0 .8rem}
  .nav-g{margin-bottom:1.55rem}
  .nav-h{display:block;font-size:var(--fs-label);font-weight:700;letter-spacing:.13em;color:#c9aab4;
         padding:.32rem .8rem .5rem}
  .nav a{display:block;color:var(--side-text);text-decoration:none;font-size:var(--fs-nav);padding:.5rem .8rem;
         border-radius:4px;line-height:1.4;border-left:3px solid transparent}
  .nav a:hover{background:#301820;color:#fff}
  .nav a.on{background:var(--accent2);color:var(--ink);font-weight:700;border-left-color:var(--accent)}
  /* 「本页」目录移到左栏顶部（品牌之下、站点导航之上）。
     当你已经在一页上时，「这一页有什么」是最该先看见的导航——原先它排在
     23 条站点链接之后，在 900px 笔记本上永远落在折叠外，等于没有。
     只在声明了小节的页面出现，用底边线与下方的站点导航分隔。 */
  .subnav{margin:0 1.25rem 1.3rem;padding-bottom:1.2rem;border-bottom:1px solid var(--side-border)}
  .sub-h{display:block;font-size:var(--fs-label);font-weight:700;letter-spacing:.13em;color:#c9aab4;margin-bottom:.55rem}
  .subnav a{display:block;color:#d6bdc4;text-decoration:none;font-size:.87rem;
            padding:.44rem 0 .44rem .8rem;
            border-left:1px solid var(--side-border);line-height:1.45}
  .subnav a:hover{color:#fff;border-left-color:#c45a7c}
  .content{display:flex;flex-direction:column;min-width:0}
  .content main{flex:1;padding:clamp(2.8rem,4.8vw,4.5rem) clamp(24px,5vw,76px) 5.2rem;
                max-width:min(86rem,100%);width:100%}
  .content footer{margin:0 clamp(24px,5vw,76px) 0;padding:1.6rem 1.8rem;background:var(--sunk);
                  border-top:1px solid var(--deep);font-size:.84rem;color:var(--muted);line-height:1.78;max-width:min(86rem,100%)}

  /* 窄屏：左栏收到顶部，用 <details> 自带的开合。纯 CSS 几何箭头，禁用任何字符图标。 */
  @media(max-width:760px){
    body{font-size:1rem;line-height:1.78}
    .layout{grid-template-columns:1fr}
    .side{position:static;height:auto;padding:.7rem 0}
    .side summary{cursor:pointer;padding-right:1.1rem;display:flex;align-items:center;justify-content:space-between}
    .nav-toggle::after{content:'';display:inline-block;width:6px;height:6px;
                       border-right:1.5px solid var(--side-muted);border-bottom:1.5px solid var(--side-muted);
                       transform:rotate(45deg);margin-left:.4rem}
    .brand{padding-bottom:.7rem;margin-bottom:0;border-bottom:0}
    .nav,.subnav{margin-top:.45rem}
    .nav a{font-size:.96rem;padding:.55rem .8rem}
    .subnav a{font-size:.9rem;padding:.48rem 0 .48rem .8rem}
  }
  .crumb{font-size:var(--fs-meta);color:var(--faint);margin-bottom:1.1rem;font-variant-numeric:tabular-nums}
  .crumb a{text-decoration:none;border-bottom:1px solid var(--deep)}
  h1{font-family:var(--serif);font-weight:700;letter-spacing:-.03em;line-height:1.1;
     font-size:var(--fs-h1);margin:0 0 1.15rem;text-wrap:balance;font-variant-numeric:tabular-nums}
  h1 .num{color:var(--accent);margin-right:.55rem;font-variant-numeric:tabular-nums}
  .lede{font-size:var(--fs-lead);color:var(--muted);max-width:64ch;margin:0 0 2.45rem;line-height:1.85;text-wrap:pretty}
  .lede strong,.lede b{color:var(--ink)}
  h2{font-family:var(--serif);font-size:var(--fs-h2);font-weight:700;letter-spacing:-.02em;line-height:1.3;
     margin:4rem 0 .7rem;padding-top:1.5rem;border-top:1px solid var(--sunk);
     text-wrap:balance;font-variant-numeric:tabular-nums}
  h2:first-of-type{margin-top:2.5rem;padding-top:0;border-top:0}
  .h2sub{font-size:1rem;color:var(--faint);margin:0 0 1.6rem;max-width:68ch;line-height:1.75}
  h3{font-size:var(--fs-h3);font-weight:650;line-height:1.45;margin:2.2rem 0 .65rem;text-wrap:balance}
  p{margin:0 0 1.25rem;max-width:66ch;line-height:inherit;text-wrap:pretty}
  code{font-family:var(--mono);font-size:.88em;background:var(--sunk);color:var(--ink);padding:.12em .4em;border-radius:2px}
  pre{margin:1.1rem 0 1.5rem;background:#211015;color:#f3e6e9;padding:1.25rem 1.5rem;overflow-x:auto;
      font-family:var(--mono);font-size:.86rem;line-height:1.7;border:1px solid var(--side-border);border-radius:2px}
  /* 提示词复制：按钮贴在代码块右上角，横向滚动时不动。 */
  .copybox{position:relative}
  .copybox>pre{margin:0;padding-right:4.7rem}
  .copy-btn{position:absolute;top:.55rem;right:.6rem;z-index:1;
    font:600 .74rem/1 var(--sans);color:#f3e6e9;background:#3b2029;
    border:1px solid #5a3440;border-radius:2px;padding:.36rem .6rem;
    cursor:pointer;opacity:.88;transition:opacity .12s,background-color .12s}
  .copy-btn:hover{opacity:1;background:#5a3440}
  .copy-btn:focus-visible{outline:2px solid var(--accent2);outline-offset:2px}
  .copy-btn.done{background:var(--accent);border-color:var(--accent);opacity:1}
  .card{background:var(--surface);padding:1.65rem 1.85rem 1.7rem;border:1px solid var(--deep)}
  .card h3{margin-top:0}
  .card p{max-width:none;line-height:1.8}
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
  thead th{font-size:var(--fs-meta);font-weight:650;color:var(--muted);background:var(--accent-soft);
           text-align:left;padding:.95rem 1.2rem .85rem;border-bottom:1px solid var(--deep);letter-spacing:.02em;line-height:1.5}
  tbody td{font-size:.94rem;color:var(--muted);padding:.95rem 1.2rem;border-bottom:1px solid var(--sunk);vertical-align:top;line-height:1.72}
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
    table.cases-table td{border:0;padding:0;font-size:.95rem;line-height:1.75}
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
  .note{background:var(--accent-soft);padding:1.45rem 1.75rem;border:1px solid var(--deep);
        margin:1.6rem 0 2rem;font-size:1rem;color:var(--muted);line-height:1.8}
  .note.warn{border-color:#d9a6a6;background:var(--alert2);color:#4a1818}
  .note.warn b{color:#2e0d0d}
  .note b{color:var(--ink)}
  .cover{background:var(--surface);border:1px solid var(--deep);padding:1.5rem 1.8rem;margin:1.6rem 0 2.2rem}
  .cover .row{display:flex;gap:1.25rem;align-items:baseline;flex-wrap:wrap;font-size:.97rem;color:var(--muted);
              padding:.65rem 0;border-bottom:1px solid var(--sunk);line-height:1.75}
  .cover .row:last-child{border:0}
  .cover .k{flex:0 0 8.5rem;color:var(--faint);font-size:var(--fs-meta);font-weight:600}
  .cover .v{flex:1;min-width:220px}
  .nextprev{display:flex;justify-content:space-between;gap:1.5rem;margin-top:4rem;padding-top:1.6rem;
            border-top:1px solid var(--deep);font-size:.97rem}
  .nextprev a{text-decoration:none;font-weight:600}
  .nextprev .lbl{display:block;font-size:.8rem;color:var(--faint);font-weight:400;margin-bottom:.2rem}
  footer{margin-top:3.5rem;padding:1.5rem 1.8rem;background:var(--sunk);font-size:var(--fs-meta);color:var(--muted);line-height:1.8}
  footer code{background:transparent;padding:0}
  ul,ol{padding-left:1.4rem;margin:.7rem 0 1.5rem}
  li{margin-bottom:.55rem;font-size:var(--fs-body);color:var(--muted);line-height:1.8;max-width:66ch}
  li b{color:var(--ink)}
  /* 表格页：一行 = 一条记录，字段全部展开。空字段保持可读对比度 >= 4.5:1 */
  .tb-index{background:var(--surface);border:1px solid var(--deep);padding:1.2rem 1.5rem;margin:1.4rem 0 1.8rem;font-size:.94rem}
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
  table.tb-fields td:last-child{font-size:.95rem;color:var(--ink)}
  table.tb-fields tr.tb-empty td:first-child{color:var(--faint)}
  .tb-no{color:var(--faint);font-style:italic;font-size:var(--fs-meta)}
  @media(max-width:620px){
    table.tb-fields td:first-child{width:7rem;font-size:.78rem}
  }
  @media print{
    body{background:#fff}.top{display:none}
    .card,.grid{break-inside:avoid}
    a{color:#000;text-decoration:none}
  }
"""

COPY_JS = """<script>
(function () {
  // 窄屏默认收起导航：展开的 40 条链接会把正文推到几屏之后。
  var side = document.querySelector('.side details');
  if (side && window.matchMedia('(max-width:760px)').matches) side.removeAttribute('open');

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        if (document.execCommand('copy')) resolve();
        else reject(new Error('copy failed'));
      } catch (err) {
        reject(err);
      } finally {
        document.body.removeChild(ta);
      }
    });
  }

  document.querySelectorAll('pre.prompt').forEach(function (pre) {
    if (pre.closest('.copybox')) return;
    var box = document.createElement('div');
    box.className = 'copybox';
    box.style.margin = getComputedStyle(pre).margin;
    pre.parentNode.insertBefore(box, pre);
    box.appendChild(pre);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.textContent = '复制';
    btn.setAttribute('aria-label', '复制这段提示词');
    btn.addEventListener('click', function () {
      copyText(pre.textContent).then(function () {
        btn.textContent = '已复制';
        btn.classList.add('done');
        setTimeout(function () {
          btn.textContent = '复制';
          btn.classList.remove('done');
        }, 1500);
      }).catch(function () {
        btn.textContent = '复制失败';
        setTimeout(function () { btn.textContent = '复制'; }, 1500);
      });
    });
    box.appendChild(btn);
  });
})();
</script>"""


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
        ('查阅', [('architecture', '架构全景'), ('cheatsheet', '作战手卡'),
                  ('failure-atlas', '故障图鉴'), ('agent-graph', 'Agent 图谱'),
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
    """二级导航：本页小节。由页面自己声明，不自动抓 h2。

    它是一个有名字的 nav 地标，与站点主导航区分开——读屏用户能在「本页目录」
    和「站点导航」之间直接跳选，而不是面对两段无名的链接堆。
    """
    if not sections:
        return ''
    out = ['<nav class="subnav" aria-label="本页目录"><span class="sub-h">本页</span>']
    for anchor, label in sections:
        out.append(f'<a href="#{anchor}">{label}</a>')
    out.append('</nav>')
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
<a class="skip" href="#main">跳到正文</a>
<div class="layout">
  <aside class="side">
    <div class="brand">
      <a class="home" href="{_href('index')}">ANB</a>
      <span class="brand-sub">Agent Native Builder</span>
    </div>
    <details open>
      <summary class="nav-toggle">站点导航</summary>
      {subnav(sections, slug)}
      <nav class="nav" aria-label="站点导航">
        {nav(slug)}
      </nav>
    </details>
  </aside>
  <div class="content">
    <main id="main" tabindex="-1">
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
{COPY_JS}
</body>
</html>"""
