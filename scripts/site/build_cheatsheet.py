import sys, os
from build_shell import page
from paths import out_dir
from battle_tips_data import THEMES

CSS_CHEATSHEET = """
  .cs-theme{margin:2.5rem 0 3rem;padding-top:1.5rem;border-top:1px solid var(--deep)}
  .cs-theme:first-of-type{border-top:0;margin-top:1rem;padding-top:0}
  .cs-meta{font-size:.84rem;color:var(--faint);margin:0 0 1.2rem}
  .cs-card{background:var(--surface);border:1px solid var(--deep);padding:1.2rem 1.3rem;margin-bottom:1px;position:relative}
  .cs-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:.5rem;border-bottom:1px solid var(--sunk);padding-bottom:.4rem}
  .cs-head h3{margin:0;font-size:.98rem;font-weight:650;color:var(--ink)}
  .cs-num{font-family:var(--mono);font-size:.82rem;font-weight:700;color:var(--accent)}
  .cs-stage-tag{font-size:.7rem;padding:.05rem .35rem;background:var(--accent2);color:var(--accent);border-radius:2px;margin-left:.4rem;font-family:var(--sans)}
  .cs-prob{font-size:.86rem;color:var(--alert);margin:0 0 .6rem;line-height:1.45}
  .cs-prob b{color:var(--ink)}
  .cs-tips{margin:0 0 .7rem;padding-left:1.1rem;font-size:.85rem;color:var(--muted);line-height:1.55}
  .cs-tips li{margin-bottom:.25rem}
  .cs-prompt{background:#20211d;color:#e6e4dc;padding:.65rem .85rem;margin:.5rem 0;font-family:var(--mono);font-size:.78rem;line-height:1.5;border-radius:2px;overflow-x:auto}
  .cs-prompt-lbl{font-size:.7rem;font-weight:700;color:#8d8f86;letter-spacing:.05em;margin-bottom:.2rem;text-transform:uppercase}
  .cs-verdict{background:var(--sunk);padding:.45rem .65rem;font-size:.8rem;color:var(--ink);border-left:3px solid var(--accent);margin-top:.6rem}
  .cs-nav-chips{display:flex;gap:.35rem;flex-wrap:wrap;margin:1.2rem 0 1.8rem}
  .cs-chip{font:inherit;font-size:.82rem;padding:.3rem .65rem;background:var(--surface);color:var(--muted);border:1px solid var(--deep);text-decoration:none}
  .cs-chip:hover{border-color:var(--accent);color:var(--ink);background:var(--accent2)}
"""

def cheatsheet_page():
    b = ['<style>' + CSS_CHEATSHEET + '</style>']
    b.append('<h1>实战作战手卡 · 36 条</h1>')
    b.append('<p class="lede">把一组收藏压缩成可执行的工作闭环：<b>先说清场景，再选择方法，最后保留证据</b>。<br>'
             '整理自一线 Agent 工程与大模型产品实战，涵盖 Agent 工程、上下文、Eval 评测、创意流、产品增长与数据研究 6 大主题。</p>')

    b.append('''<div class="note"><b>作战原则。</b>
不是把收藏变成口号，而是把它变成下一次可以执行和验证的动作。<br>
每张卡片遵循四段式结构：<b>问题暴露 → TIPS 实操要点 → PROMPT 复制口令 → 验收判定</b>。</div>''')

    # 快捷锚点 Chips
    chips = []
    for t in THEMES:
        chips.append(f'<a class="cs-chip" href="#{t["id"]}"><b>{t["num"]}</b> {t["title"].split("：")[0]}</a>')
    b.append('<div class="cs-nav-chips">' + ''.join(chips) + '</div>')

    # 渲染 6 大主题
    stage_names = {
        'need': '需求', 'design': '设计', 'build': '开发',
        'verify': '验收', 'ship': '交付', 'operate': '运营',
        'iterate': '迭代', 'manage': '管理',
    }

    sections = []
    for t in THEMES:
        sections.append((t['id'], f'{t["num"]} {t["title"].split("：")[0]}'))
        b.append(f'<div class="cs-theme" id="{t["id"]}">'
                 f'<h2><span class="num">{t["num"]}</span>{t["title"]}</h2>'
                 f'<p class="cs-meta"><b>主题聚焦</b>：{t["subtitle"]} ｜ <b>关联阶段</b>：{t["stage_map"]}</p>')

        cards_html = []
        for c in t['cards']:
            tips_li = ''.join(f'<li>{tip}</li>' for tip in c['tips'])
            stg_lbl = stage_names.get(c['stage'], c['stage'])
            cards_html.append(
                f'<div class="cs-card" id="{t["id"]}-{c["num"]}">'
                f'<div class="cs-head">'
                f'<h3><span class="cs-num">{t["num"]}-{c["num"]}</span> {c["title"]} '
                f'<a href="{c["stage"]}.html" class="cs-stage-tag" title="前往 {stg_lbl} 阶段">{stg_lbl}</a></h3>'
                f'</div>'
                f'<p class="cs-prob"><b>痛点：</b>{c["problem"]}</p>'
                f'<ul class="cs-tips">{tips_li}</ul>'
                f'<div class="cs-prompt-lbl">PROMPT 复制口令</div>'
                f'<pre class="cs-prompt">{c["prompt"]}</pre>'
                f'<div class="cs-verdict"><b>验收判定：</b>{c["verdict"]}</div>'
                f'</div>'
            )
        b.append('<div class="grid two">' + ''.join(cards_html) + '</div></div>')

    crumb = '<a href="./">总览</a> / 作战手卡'
    return page('cheatsheet', '实战作战手卡', '\n'.join(b), crumb=crumb, sections=sections)

if __name__ == '__main__':
    open(os.path.join(out_dir(), 'cheatsheet.html'), 'w', encoding='utf-8').write(cheatsheet_page())
    print('cheatsheet.html 生成')
