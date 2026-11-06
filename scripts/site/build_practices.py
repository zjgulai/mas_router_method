"""实战用法页：把 practices_data 里的案例渲染成可读的案例集。

页面按层组织，一层一批上线。渲染只依赖数据里的字段，后续批次追加
PRACTICES 条目时不需要改这里。阶段链接用 STAGES 的中文名，管理不在
七阶段里，单独补一个名字，避免链接文字掉回 slug。
"""
import os

from build_shell import page, STAGES
from paths import out_dir
from practices_data import LAYERS, PRACTICES

STAGE_NAME = {slug: name for slug, name, _ in STAGES}
STAGE_NAME['manage'] = '管理'


def _stage_links(practice):
    return ' · '.join(
        f'<a href="{slug}.html">{STAGE_NAME.get(slug, slug)}</a>'
        for slug in practice['stages'])


def _practice_card(p):
    b = [f'<article class="card" id="p-{p["id"]}">']
    b.append(f'<h3>{p["title"]}</h3>')
    b.append(f'<p class="h2sub">{p["one_line"]}</p>')
    b.append('<p><b>它解决什么</b></p>')
    b.append(f'<p>{p["problem"]}</p>')
    b.append('<p><b>方法长什么样</b></p>')
    b.append('<ol>' + ''.join(f'<li><b>{k}</b>：{v}</li>' for k, v in p['method']) + '</ol>')
    b.append('<p><b>搬到 ANB 的哪个阶段</b></p>')
    b.append(f'<p>{_stage_links(p)}</p>')
    b.append('<ul>' + ''.join(f'<li>{a}</li>' for a in p['apply']) + '</ul>')
    b.append('<p><b>可以直接用的提示词</b></p>')
    b.append(f'<pre>{p["prompt"]}</pre>')
    b.append('<p><b>作者报告的效果</b></p>')
    b.append(f'<p>{p["effect"]}</p>')
    b.append(f'<p><b>来源</b>：<a href="{p["repo_url"]}">{p["repo"]}</a></p>')
    b.append('</article>')
    return '\n'.join(b)


def _layer_row(layer):
    ps = [p for p in PRACTICES if p['layer'] == layer['id']]
    if ps:
        label = f'<a href="#layer-{layer["id"]}">{layer["num"]} {layer["title"]}</a>'
        status = f'{len(ps)} 条，本批'
    else:
        label = f'{layer["num"]} {layer["title"]}'
        status = '下一批'
    return f'<tr><td>{label}</td><td>{layer["lede"]}</td><td>{status}</td></tr>'


def practices_page():
    b = ['<style>.card pre{white-space:pre-wrap;word-break:break-word}</style>']
    b.append('<h1>实战用法</h1>')
    b.append('<p class="lede">这里收的是别人已经在用的 agent 产品做法，按四层分开：'
             '<b>行为、流程、编排、证据</b>。每一层写清四件事：它解决什么问题、方法长什么样、'
             '怎么搬到 ANB 的阶段、以及可以直接复制的提示词。整页分四批上线，'
             '当前批次是行为层。</p>')

    b.append('<h2>四层目录</h2>')
    b.append('<p class="h2sub">先看哪一层对得上你现在的症状。已经收录的层可以点进去，'
             '其余三层会在后续批次补齐。</p>')
    b.append('<table><thead><tr><th style="width:28%">层</th>'
             '<th style="width:56%">这一层管什么</th><th>收录</th></tr></thead><tbody>'
             + ''.join(_layer_row(layer) for layer in LAYERS)
             + '</tbody></table>')

    for layer in LAYERS:
        ps = [p for p in PRACTICES if p['layer'] == layer['id']]
        if not ps:
            continue
        b.append(f'<h2 id="layer-{layer["id"]}">{layer["num"]} {layer["title"]}</h2>')
        b.append(f'<p class="h2sub">{layer["lede"]}</p>')
        for p in ps:
            b.append(_practice_card(p))

    b.append('<div class="note"><b>怎么用这一页。</b>'
             '先读「它解决什么」，判断是不是你现在的症状；再挑方法里一条今天就能做的；'
             '提示词可以直接复制，先在一件小事上试，再决定要不要改常驻规则。</div>')

    return page('practices', '实战用法', '\n'.join(b), '<a href="./">总览</a> / 实战用法')


if __name__ == '__main__':
    open(os.path.join(out_dir(), 'practices.html'), 'w', encoding='utf-8').write(practices_page())
    print(f'实战用法 {len(PRACTICES)} 条，生成完成')
