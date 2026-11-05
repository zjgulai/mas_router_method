import sys, os
from build_shell import page
from paths import out_dir
from battle_tips_data import THEMES

CSS_CHEATSHEET = """
  .cs-theme{margin:3.4rem 0 4rem;padding-top:2.2rem;border-top:1px solid var(--deep)}
  .cs-theme:first-of-type{border-top:0;margin-top:1.6rem;padding-top:0}
  .cs-meta{font-size:.9rem;color:var(--faint);margin:0 0 1.6rem;line-height:1.65}
  .cs-card{background:var(--surface);border:1px solid var(--deep);padding:1.75rem 2rem 1.8rem;position:relative;display:flex;flex-direction:column}
  .cs-head{display:flex;justify-content:space-between;align-items:baseline;gap:.75rem;margin-bottom:.85rem;border-bottom:1px solid var(--sunk);padding-bottom:.65rem}
  .cs-head h3{margin:0;font-size:1.05rem;font-weight:650;color:var(--ink);line-height:1.38}
  .cs-num{font-family:var(--mono);font-size:.84rem;font-weight:700;color:var(--accent);margin-right:.35rem}
  .cs-stage-tag{font-size:.76rem;font-weight:600;padding:.14rem .52rem;background:var(--accent2);color:var(--accent);border-radius:2px;margin-left:.45rem;font-family:var(--sans);text-decoration:none}
  .cs-prob{font-size:.92rem;color:var(--alert);margin:0 0 .85rem;line-height:1.64;max-width:none}
  .cs-prob b{color:var(--ink)}
  .cs-tips{margin:0 0 1.1rem;padding-left:1.25rem;font-size:.9rem;color:var(--muted);line-height:1.68}
  .cs-tips li{margin-bottom:.42rem}
  .cs-prompt-lbl{font-size:.78rem;font-weight:650;color:var(--faint);letter-spacing:.04em;margin-bottom:.35rem}
  .cs-prompt{background:#211015;color:#f3e6e9;padding:1.05rem 1.25rem;margin:.25rem 0 1.05rem;font-family:var(--mono);font-size:.82rem;line-height:1.65;border-radius:2px;overflow-x:auto;white-space:pre-wrap;word-break:break-word}
  .cs-verdict{background:var(--accent-soft);padding:.8rem 1.05rem;font-size:.88rem;color:var(--ink);border:1px solid var(--deep);margin-top:auto;line-height:1.62}
  .cs-nav-chips{display:flex;gap:.6rem;flex-wrap:wrap;margin:1.5rem 0 2.2rem}
  .cs-chip{font:inherit;font-size:.86rem;padding:.5rem .95rem;background:var(--surface);color:var(--muted);border:1px solid var(--deep);text-decoration:none;border-radius:2px}
  .cs-chip:hover{border-color:var(--accent);color:var(--ink);background:var(--accent2)}
  .cs-theme h2 .num{margin-right:.6rem}
"""

def cheatsheet_page():
    b = ['<style>' + CSS_CHEATSHEET + '</style>']
    b.append('<h1>实战作战手卡 · 36 条</h1>')
    b.append('<p class="lede">把一组收藏压缩成可执行的工作闭环：<b>先说清场景，再选择方法，最后保留证据</b>。<br>'
             '整理自一线 Agent 工程与大模型产品实战，涵盖 Agent 工程、上下文、Eval 评测、创意流、产品增长与数据研究 6 大主题。</p>')

    b.append('''<div class="note"><b>作战原则。</b>
不是把收藏变成口号，而是把它变成下一次可以执行和验证的动作。<br>
每张卡片遵循四段式结构：<b>问题暴露 · 实操要点 · 复制口令 · 验收判定</b>。</div>''')

    chips = []
    for t in THEMES:
        chips.append(f'<a class="cs-chip" href="#{t["id"]}"><b>{t["num"]}</b> {t["title"].split("：")[0]}</a>')
    b.append('<div class="cs-nav-chips">' + ''.join(chips) + '</div>')

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
                 f'<p class="cs-meta"><b>主题聚焦</b>：{t["subtitle"]} · <b>关联阶段</b>：{t["stage_map"]}</p>')

        cards_html = []
        for c in t['cards']:
            tips_li = ''.join(f'<li>{tip}</li>' for tip in c['tips'])
            stg_lbl = stage_names.get(c['stage'], c['stage'])
            cards_html.append(
                f'<div class="cs-card" id="{t["id"]}-{c["num"]}">'
                f'<div class="cs-head">'
                f'<h3><span class="cs-num">{t["num"]}-{c["num"]}</span>{c["title"]}'
                f'<a href="{c["stage"]}.html" class="cs-stage-tag" title="前往 {stg_lbl} 阶段">{stg_lbl}</a></h3>'
                f'</div>'
                f'<p class="cs-prob"><b>痛点：</b>{c["problem"]}</p>'
                f'<ul class="cs-tips">{tips_li}</ul>'
                f'<div class="cs-prompt-lbl">复制口令 (Prompt)</div>'
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
