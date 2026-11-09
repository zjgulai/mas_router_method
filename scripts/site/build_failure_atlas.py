import os

from build_shell import page
from paths import out_dir
from failure_atlas_data import FAILURES, TIERS

CSS_ATLAS = """
  .fa-legend{display:flex;gap:.65rem;flex-wrap:wrap;margin:1.5rem 0 2.4rem}
  .fa-leg{font-size:.84rem;padding:.5rem .9rem;background:var(--surface);border:1px solid var(--deep);border-radius:2px;color:var(--muted)}
  .fa-leg b{color:var(--ink);font-family:var(--mono);margin-right:.35rem}
  .fa-chips{display:flex;gap:.6rem;flex-wrap:wrap;margin:1.4rem 0 2.6rem}
  .fa-chip{font-size:.86rem;padding:.5rem .95rem;background:var(--surface);color:var(--muted);border:1px solid var(--deep);text-decoration:none;border-radius:2px}
  .fa-chip:hover{border-color:var(--accent);color:var(--ink);background:var(--accent2)}
  .fa-chip b{color:var(--accent);font-family:var(--mono);margin-right:.4rem}
  .fa-item{margin:3.4rem 0 0;padding-top:2.2rem;border-top:1px solid var(--deep)}
  .fa-item:first-of-type{border-top:0;padding-top:.4rem;margin-top:1.4rem}
  .fa-head h2{margin:0 0 .3rem;border:0;padding:0}
  .fa-head h2 .num{color:var(--accent);margin-right:.6rem;font-variant-numeric:tabular-nums}
  .fa-sub{font-size:1rem;color:var(--faint);margin:0 0 1.2rem;max-width:64ch;line-height:1.7}
  .fa-headline{background:var(--alert2);color:#4a1818;padding:1rem 1.3rem;border:1px solid #d9a6a6;border-radius:2px;margin:0 0 1.6rem;font-size:.95rem;line-height:1.66;display:flex;gap:.8rem;align-items:baseline}
  .fa-fixes{list-style:none;margin:0;padding:0}
  .fa-fix{display:flex;gap:.9rem;align-items:baseline;padding:.85rem 0;border-bottom:1px solid var(--sunk);font-size:.95rem;color:var(--muted);line-height:1.7}
  .fa-fix:last-child{border-bottom:0}
  .fa-fix .txt{flex:1}
  .fa-fix .txt b{color:var(--ink)}
  .fa-src{font-size:.82rem;color:var(--faint);margin-left:.4rem}
  .tier{flex:0 0 auto;font-family:var(--mono);font-size:.74rem;font-weight:700;width:1.5rem;height:1.5rem;display:inline-flex;align-items:center;justify-content:center;border-radius:2px;border:1px solid var(--deep)}
  .tier-P{background:var(--accent2);color:var(--accent);border-color:var(--accent)}
  .tier-V{background:var(--warn2);color:var(--warn)}
  .tier-D{background:var(--sunk);color:var(--muted)}
  .tier-A{background:var(--surface);color:var(--faint)}
  .fa-see{margin:1.3rem 0 0;font-size:.9rem;color:var(--muted)}
  .fa-see a{margin-right:.9rem}
"""

TIER_NAME = {t[0]: t[1] for t in TIERS}


def _tier(level):
    return f'<span class="tier tier-{level}" title="{TIER_NAME.get(level, level)}">{level}</span>'


def failure_atlas_page():
    b = ['<style>' + CSS_ATLAS + '</style>']
    b.append('<h1>架构故障图鉴 · 八个故障</h1>')
    b.append('<p class="lede">多智能体系统不是从技巧开始坏的，是从<b>结构性故障</b>开始坏的。'
             '这一页把八个反复出现的故障、每个的结构修法、以及每条修法的<b>证据强度</b>列在一起——'
             '先认故障，再选修法，最后看证据站不站得住。<br>'
             '萃取自一张在 X 上流传的 Agentic 架构故障图（@sermakarevich 汇编转述）；措辞归属原图，不写成本站结论。</p>')

    b.append('<div class="note"><b>为什么按故障排，不按技巧排。</b> '
             '本仓库名为 <code>mas_router_method</code>——多智能体系统的<b>路由</b>方法。'
             '图里的故障 04（用实测统计路由，不靠模型自判）与 07（先路由便宜的）正是这个命名的立论来源。'
             '诊断顺序也一致：<b>先定位故障层，再动修法</b>（eval → data → tool → prompt），'
             '而不是一上来就改提示词。</div>')

    legend = ''.join(
        f'<span class="fa-leg">{_tier(code)}<b>{code}</b>{name}</span>'
        for code, name, _desc in TIERS)
    b.append(f'<p class="cs-meta" style="margin:.2rem 0 .6rem;color:var(--faint);font-size:.9rem">'
             f'证据分级（沿用原图标注）</p>')
    b.append('<div class="fa-legend">' + legend + '</div>')

    chips = ''.join(
        f'<a class="fa-chip" href="#{f["id"]}"><b>{f["num"]}</b>{f["title"]}</a>'
        for f in FAILURES)
    b.append('<div class="fa-chips">' + chips + '</div>')

    sections = []
    for f in FAILURES:
        sections.append((f['id'], f'{f["num"]} {f["title"]}'))

        fixes_li = []
        for txt, tier, src in f['fixes']:
            src_html = f'<span class="fa-src">— {src}</span>' if src else ''
            fixes_li.append(
                f'<li class="fa-fix">{_tier(tier)}'
                f'<span class="txt">{txt}{src_html}</span></li>')

        see = ''.join(f'<a href="{slug}.html">{name}</a>' for slug, name in f['links'])

        b.append(
            f'<div class="fa-item" id="{f["id"]}">'
            f'<div class="fa-head"><h2><span class="num">{f["num"]}</span>{f["title"]}</h2></div>'
            f'<p class="fa-sub">{f["subtitle"]}</p>'
            f'<div class="fa-headline">{_tier(f["headline_tier"])}'
            f'<span>{f["headline"]}</span></div>'
            f'<ul class="fa-fixes">{"".join(fixes_li)}</ul>'
            f'<p class="fa-see"><b>接着查：</b>{see}</p>'
            f'</div>')

    crumb = '<a href="./">总览</a> / 架构故障图鉴'
    return page('failure-atlas', '架构故障图鉴', '\n'.join(b), crumb=crumb, sections=sections)


if __name__ == '__main__':
    open(os.path.join(out_dir(), 'failure-atlas.html'), 'w', encoding='utf-8').write(failure_atlas_page())
    print('failure-atlas.html 生成')
