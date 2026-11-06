"""实战用法页：把 practices_data 里的案例渲染成可读的案例集。

页面按层组织，一层一批上线。渲染只依赖数据里的字段，后续批次追加
PRACTICES 条目时不需要改这里。阶段链接用 STAGES 的中文名，管理不在
七阶段里，单独补一个名字，避免链接文字掉回 slug。

案例数据按纯文本处理，渲染时统一 HTML 转义；这样正文里可以放心写
`<文档>`、`<命令>` 这类占位符，不会被浏览器当成标签吞掉。

可选字段：facts（关键数字表）、cases（补充小节）、tables（对比表）。
字段缺省时不渲染，后续批次可以只填基础字段。
"""
import html
import os

from build_shell import page, STAGES
from paths import out_dir
from practices_data import LAYERS, PRACTICES

STAGE_NAME = {slug: name for slug, name, _ in STAGES}
STAGE_NAME['manage'] = '管理'


def _e(value):
    return html.escape(str(value))


def _stage_links(practice):
    return ' · '.join(
        f'<a href="{_e(slug)}.html">{_e(STAGE_NAME.get(slug, slug))}</a>'
        for slug in practice['stages'])


def _facts(p):
    if not p.get('facts'):
        return []
    rows = ''.join(f'<tr><th>{_e(k)}</th><td>{_e(v)}</td></tr>' for k, v in p['facts'])
    return [f'<table class="practice-facts"><tbody>{rows}</tbody></table>']


def _cases(p):
    out = []
    for title, body in p.get('cases', []):
        out.append(f'<h4>{_e(title)}</h4>')
        out.append(f'<p>{_e(body)}</p>')
    return out


def _tables(p):
    out = []
    for t in p.get('tables', []):
        caption = f'<caption>{_e(t["caption"])}</caption>' if t.get('caption') else ''
        head = ''.join(f'<th>{_e(h)}</th>' for h in t['headers'])
        body = ''.join(
            '<tr>' + ''.join(f'<td>{_e(c)}</td>' for c in row) + '</tr>'
            for row in t['rows'])
        out.append(f'<table>{caption}<thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>')
    return out


def _practice_card(p):
    b = [f'<article class="card" id="p-{_e(p["id"])}">']
    b.append(f'<h3>{_e(p["title"])}</h3>')
    b.append(f'<p class="h2sub">{_e(p["one_line"])}</p>')
    b += _facts(p)
    b.append('<p><b>它解决什么</b></p>')
    b.append(f'<p>{_e(p["problem"])}</p>')
    b.append('<p><b>方法长什么样</b></p>')
    b.append('<ol>' + ''.join(f'<li><b>{_e(k)}</b>：{_e(v)}</li>' for k, v in p['method']) + '</ol>')
    b += _cases(p)
    b.append('<p><b>搬到 ANB 的哪个阶段</b></p>')
    b.append(f'<p>{_stage_links(p)}</p>')
    b.append('<ul>' + ''.join(f'<li>{_e(a)}</li>' for a in p['apply']) + '</ul>')
    b += _tables(p)
    b.append('<p><b>可以直接用的提示词</b></p>')
    b.append(f'<pre>{_e(p["prompt"])}</pre>')
    b.append('<p><b>作者报告的效果</b></p>')
    b.append(f'<p>{_e(p["effect"])}</p>')
    b.append(f'<p><b>来源</b>：<a href="{_e(p["repo_url"])}">{_e(p["repo"])}</a></p>')
    b.append('</article>')
    return '\n'.join(b)


def _layer_row(layer):
    ps = [p for p in PRACTICES if p['layer'] == layer['id']]
    if ps:
        label = f'<a href="#layer-{_e(layer["id"])}">{_e(layer["num"])} {_e(layer["title"])}</a>'
        status = f'{len(ps)} 条'
    else:
        label = f'{_e(layer["num"])} {_e(layer["title"])}'
        status = '下一批'
    return f'<tr><td>{label}</td><td>{_e(layer["lede"])}</td><td>{status}</td></tr>'


def practices_page():
    b = ["""<style>
.card pre{white-space:pre-wrap;word-break:break-word}
.practice-facts{margin:1.1rem 0 1.4rem;font-size:.9rem;border-collapse:collapse;width:100%}
.practice-facts th{width:22%;color:var(--faint);font-weight:600;vertical-align:top;padding:.4rem .9rem .4rem 0;border-bottom:1px solid var(--sunk)}
.practice-facts td{padding:.4rem 0;border-bottom:1px solid var(--sunk);color:var(--muted)}
.card h4{margin:1.6rem 0 .45rem;font-size:1rem;color:var(--accent);letter-spacing:.01em}
.card caption{text-align:left;font-size:.82rem;color:var(--faint);padding:.2rem 0 .5rem}
.card table{margin:1.2rem 0 1.6rem}
</style>"""]
    b.append('<h1>实战用法</h1>')
    b.append('<p class="lede">这里收的是别人已经在用的 agent 产品做法，按四层分开：'
             '<b>行为、流程、编排、证据</b>。每一层写清四件事：它解决什么问题、方法长什么样、'
             '怎么搬到 ANB 的阶段、以及可以直接复制的提示词。四层都已收录。</p>')

    b.append('<h2>四层目录</h2>')
    b.append('<p class="h2sub">先看哪一层对得上你现在的症状。四层都已收录，可以按症状直接点进去。</p>')
    b.append('<table><thead><tr><th style="width:28%">层</th>'
             '<th style="width:56%">这一层管什么</th><th>收录</th></tr></thead><tbody>'
             + ''.join(_layer_row(layer) for layer in LAYERS)
             + '</tbody></table>')

    for layer in LAYERS:
        ps = [p for p in PRACTICES if p['layer'] == layer['id']]
        if not ps:
            continue
        b.append(f'<h2 id="layer-{_e(layer["id"])}">{_e(layer["num"])} {_e(layer["title"])}</h2>')
        b.append(f'<p class="h2sub">{_e(layer["lede"])}</p>')
        for p in ps:
            b.append(_practice_card(p))

    b.append('<div class="note"><b>怎么用这一页。</b>'
             '先读「它解决什么」，判断是不是你现在的症状；再挑方法里一条今天就能做的；'
             '提示词可以直接复制，先在一件小事上试，再决定要不要改常驻规则。</div>')

    return page('practices', '实战用法', '\n'.join(b), '<a href="./">总览</a> / 实战用法')


if __name__ == '__main__':
    open(os.path.join(out_dir(), 'practices.html'), 'w', encoding='utf-8').write(practices_page())
    print(f'实战用法 {len(PRACTICES)} 条，生成完成')
