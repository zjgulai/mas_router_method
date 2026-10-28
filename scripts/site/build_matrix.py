"""矩阵页：8 x 8 的交互视图，数据全部来自 docs/product/matrix.json。

为什么这一页值得存在，而不是把 markdown 表格贴上来：

一张 64 格的表只有一种读法——从左到右、从上到下。而这张矩阵真正要回答三类问题，
每一类都要用不同的切法：哪一层是空的（按层看）、哪个阶段进展最快（按阶段看）、
哪一条链能打穿（按链看）。静态表把三个问题压成一种读法，于是读者只能自己数。

所以这一页做三件事：把状态画出来让它一眼可见、允许按列/链/状态筛选、点开一格看到
三件事与检查器。不做的一件事很重要：**页面自己不算任何状态**。`matrix-check --json`
算好，这里只渲染。页面里算一遍就会和 CLI 分叉，而那是这个仓库反复在治的病。

站点上其它页面零 JS。这是第一处，所以它必须完全自包含：没有外链、没有构建步骤、
没有框架、不用 localStorage。数据内联成 JSON，交互是十几行 DOM 操作。禁用 JS 时
页面仍然完整可读——所有格子和全部内容都在 HTML 里，脚本只是叠加在它上面的筛选与展开。
"""
import json, os, subprocess

from build_shell import page
from paths import REPO

STATUS_LABEL = {'verified': '验', 'contract': '约', 'hole': '空'}
STATUS_TAG = {'verified': 't-must', 'contract': 't-branch', 'hole': 't-gap'}
STATUS_NOTE = {
    'verified': '有检查器，且命令指向的脚本存在',
    'contract': '三件事齐，没有检查器——契约在，执行不在',
    'hole': '三件事有缺，或写了「同上」',
}

STAGE_NOTE = {
    '需求': '只问要改变什么动作，不问数据怎么采',
    '设计': '满行。每层都要在这里定下样子',
    '开发': '满行。真正的交接几乎全落在这一行内部',
    '验收': '满行。有格子不等于有检查器——这一行 6/8 有',
    '交付': '只有面向用户的两层要交付',
    '运营': '唯一 8/8 满行的阶段。数据产品没有终点',
    '迭代': '呈现与报告在迭代行是空的，这是已知洞',
    '管理': '横跨七个阶段的记录层',
}

CSS = """
.mt-wrap{display:grid;gap:1px;background:var(--deep);grid-template-columns:minmax(0,1fr) minmax(300px,.72fr);margin:1rem 0 0}
@media(max-width:900px){.mt-wrap{grid-template-columns:1fr}}
.mt-grid{background:var(--surface);overflow-x:auto}
.mt-grid table{min-width:660px;margin:0}
.mt-grid thead th{position:sticky;top:0;background:var(--surface);z-index:2;text-align:center;font-size:.74rem}
.mt-grid tbody th{text-align:left;padding:.5rem .7rem;border-bottom:1px solid var(--sunk);vertical-align:top;width:9.5rem}
.mt-stage{display:block;font-family:var(--serif);font-size:.95rem;color:var(--ink);font-weight:600}
.mt-snote{display:block;font-size:.68rem;font-weight:400;color:var(--faint);line-height:1.35;margin-top:.15rem}
.mt-grid tbody td{padding:0;border-bottom:1px solid var(--sunk);border-left:1px solid var(--sunk)}
.mt-cell{cursor:pointer;position:relative;min-width:54px;height:54px;text-align:center;transition:opacity .1s}
.mt-cell:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.mt-label{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.64rem;color:var(--faint)}
.mt-dot{position:absolute;right:.24rem;bottom:.06rem;font-size:.74rem;font-weight:700;line-height:1}
.mt-verified{background:var(--accent2)}.mt-verified .mt-dot{color:var(--accent)}
.mt-contract{background:#f7f3e3}.mt-contract .mt-dot{color:var(--warn)}
.mt-hole{background:var(--alert2)}.mt-hole .mt-dot{color:var(--alert)}
.mt-none{background:var(--sunk)}.mt-none .mt-dot{color:var(--deep)}
.mt-cell.mt-dim{opacity:.18}
.mt-cell.mt-sel{box-shadow:inset 0 0 0 2px var(--ink)}
.mt-panel{background:var(--surface);padding:1.1rem 1.2rem}
.mt-panel h3{margin:0 0 .2rem;font-size:1rem}
.mt-meta{font-size:.76rem;color:var(--faint);margin:0 0 .8rem}
.mt-field{margin:0 0 .7rem}
.mt-field .k{font-size:.72rem;font-weight:700;color:var(--faint);letter-spacing:.03em;display:block;margin-bottom:.15rem}
.mt-field .v{font-size:.88rem;color:var(--ink);line-height:1.5}
.mt-check{background:var(--sunk);padding:.6rem .7rem;margin-top:.7rem;font-size:.8rem;line-height:1.55}
.mt-check code{background:transparent;padding:0;font-size:.95em;word-break:break-all}
.mt-chips{display:flex;gap:.3rem;flex-wrap:wrap;margin:.8rem 0 .2rem}
.mt-chip{font:inherit;font-size:.8rem;padding:.3rem .6rem;background:var(--surface);color:var(--muted);border:1px solid var(--deep);cursor:pointer}
.mt-chip:hover{border-color:var(--accent);color:var(--ink)}
.mt-chip.on{background:var(--ink);color:#e9e7e0;border-color:var(--ink)}
.mt-n{display:block;font-size:.66rem;opacity:.72;font-weight:400}
.mt-legend{font-size:.8rem;color:var(--faint);margin:.5rem 0 0}
.mt-trans td{font-size:.8rem}
.mt-breaks{color:var(--alert);font-size:.78rem}
"""

JS = """
<script>
(function () {
  var DATA = __DATA__;
  var STATUS = {verified: '验', contract: '约', hole: '空'};
  var cells = document.querySelectorAll('.mt-cell');
  var panel = document.getElementById('mt-panel');
  var selected = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, function (c) {
      return {'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c];
    });
  }

  function find(stage, layer) {
    for (var i = 0; i < DATA.cells.length; i++) {
      if (DATA.cells[i].stage === stage && DATA.cells[i].layer === layer) return DATA.cells[i];
    }
    return null;
  }

  function show(cell) {
    var h = find(cell.dataset.stage, cell.dataset.layer);
    if (!h) return;
    var out = '<h3>' + esc(h.stage) + ' · ' + esc(h.layer) + '</h3>';
    out += '<p class="mt-meta">' + esc(h.kind) + ' · 状态 <b>' + STATUS[h.status] + '</b>';
    if (h.status === 'contract') out += ' — 契约在，执行不在';
    if (h.status === 'hole') out += ' — 这一格是洞';
    out += '</p>';
    out += '<div class="mt-field"><span class="k">输入契约</span><span class="v">' + esc(h.input) + '</span></div>';
    out += '<div class="mt-field"><span class="k">输出契约</span><span class="v">' + esc(h.output) + '</span></div>';
    out += '<div class="mt-field"><span class="k">失败模式</span><span class="v">' + esc(h.failure) + '</span></div>';
    if (h.checker) {
      out += '<div class="mt-check"><b>检查器</b><br><code>' + esc(h.checker.cmd) + '</code><br>'
           + '<b>退出码</b> ' + esc(h.checker.exit) + '<br>'
           + '<span style="color:var(--faint)">' + esc(h.checker.note) + '</span></div>';
    } else {
      out += '<div class="mt-check">没有检查器。这一格的契约写下来了，但<b>没有任何东西会让它失败</b>'
           + '——按这个仓库自己的判据，它和一条永远不会失败的检查是同一种东西。</div>';
    }
    var me = h.stage + '·' + h.layer;
    var hops = [];
    DATA.transitions.forEach(function (t) {
      if (t.from.join('·') === me) hops.push('出 → ' + t.to.join('·'));
      if (t.to.join('·') === me) hops.push('入 ← ' + t.from.join('·'));
    });
    if (hops.length) {
      out += '<div class="mt-field" style="margin-top:.7rem"><span class="k">衔接</span>'
           + '<span class="v">' + esc(hops.join('；')) + '</span></div>';
    }
    panel.innerHTML = out;
  }

  Array.prototype.forEach.call(cells, function (cell) {
    cell.addEventListener('click', function () {
      if (selected) selected.classList.remove('mt-sel');
      selected = (selected === cell) ? null : cell;
      if (selected) { selected.classList.add('mt-sel'); show(cell); }
    });
    cell.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cell.click(); }
    });
  });

  var chips = document.querySelectorAll('[data-filter]');
  Array.prototype.forEach.call(chips, function (chip) {
    chip.addEventListener('click', function () {
      Array.prototype.forEach.call(chips, function (c) { c.classList.remove('on'); });
      chip.classList.add('on');
      var want = chip.dataset.filter;
      Array.prototype.forEach.call(cells, function (cell) {
        cell.classList.toggle('mt-dim', want !== 'all' && cell.dataset.status !== want);
      });
    });
  });

  var chainChips = document.querySelectorAll('[data-chain]');
  var active = null;
  Array.prototype.forEach.call(chainChips, function (chip) {
    chip.addEventListener('click', function () {
      var was = chip.classList.contains('on');
      Array.prototype.forEach.call(chainChips, function (c) { c.classList.remove('on'); });
      active = was ? null : chip.dataset.chain;
      if (!was) chip.classList.add('on');
      var chain = null;
      DATA.chains.forEach(function (c) { if (c.id === active) chain = c; });
      Array.prototype.forEach.call(cells, function (cell) {
        var dim = chain !== null && chain.layers.indexOf(cell.dataset.layer) === -1;
        cell.classList.toggle('mt-dim', dim);
      });
    });
  });
})();
</script>
"""


def load():
    """Ask the checker, not the raw file: status must not be computed twice."""
    out = subprocess.run(
        ['node', os.path.join(REPO, 'scripts', 'matrix-check.mjs'), '--json'],
        capture_output=True, text=True)
    # Exit 1 means the data has problems and the JSON is still printed. A page that
    # refuses to render tells a reader less than one that shows the holes.
    try:
        return json.loads(out.stdout)
    except json.JSONDecodeError:
        raise SystemExit('matrix-check --json produced no JSON:\n' + (out.stderr or out.stdout))


def grid(doc):
    cells = doc['cells']
    stages = list(dict.fromkeys(c['stage'] for c in cells))
    layers = list(dict.fromkeys(c['layer'] for c in cells))
    by = {(c['stage'], c['layer']): c for c in cells}

    head = '<tr><th scope="col"></th>' + ''.join('<th scope="col">' + l + '</th>' for l in layers) + '</tr>'
    rows = []
    for s in stages:
        tds = []
        for l in layers:
            c = by.get((s, l))
            if c is None:
                tds.append('<td class="mt-none" data-status="none"><span class="mt-dot">·</span></td>')
                continue
            tds.append(
                '<td class="mt-cell mt-' + c['status'] + '" data-stage="' + s + '" data-layer="' + l
                + '" data-status="' + c['status'] + '" tabindex="0" role="button" aria-label="'
                + s + ' ' + l + '">'
                + '<span class="mt-label">' + l + '</span>'
                + '<span class="mt-dot">' + STATUS_LABEL[c['status']] + '</span></td>')
        rows.append('<tr><th scope="row"><span class="mt-stage">' + s + '</span>'
                    + '<span class="mt-snote">' + STAGE_NOTE.get(s, '') + '</span></th>'
                    + ''.join(tds) + '</tr>')
    return head, ''.join(rows)


def body_html(doc):
    cells = doc['cells']
    counts = doc['byStatus']
    head, rows = grid(doc)

    filters = [
        ('all', '全部', str(len(cells)) + ' 格'),
        ('verified', '验', str(counts.get('verified', 0)) + ' 格有检查器'),
        ('contract', '约', str(counts.get('contract', 0)) + ' 格只有契约'),
        ('hole', '空', str(counts.get('hole', 0)) + ' 格有缺'),
    ]
    chips = ''.join(
        '<button class="mt-chip' + (' on' if k == 'all' else '') + '" data-filter="' + k
        + '" type="button">' + label + '<span class="mt-n">' + note + '</span></button>'
        for k, label, note in filters)

    chain_chips = ''.join(
        '<button class="mt-chip" data-chain="' + c['id'] + '" type="button" title="' + c['why']
        + '">链 ' + c['id'] + '：' + ' + '.join(c['layers']) + '</button>' for c in doc['chains'])

    legend = ''.join(
        '<span class="tag ' + STATUS_TAG[k] + '">' + STATUS_LABEL[k] + '</span> ' + STATUS_NOTE[k]
        + '&nbsp;&nbsp;' for k in ('verified', 'contract', 'hole'))

    trans_rows = ''.join(
        '<tr><td>' + '·'.join(t['from']) + '</td><td>' + '·'.join(t['to']) + '</td><td>'
        + t['carries'] + '</td><td>' + ' + '.join(t['versioned']) + '</td><td>'
        + t['downstreamChecks'] + '</td><td class="mt-breaks">' + t['breaks'] + '</td></tr>'
        for t in doc['transitions'])

    # The grid is rendered server-side so the page works without JS. JS only filters
    # and expands what is already here — a page that needs JS to show its content is a
    # page that shows nothing to a printout or a reader on a locked-down browser.
    parts = []
    parts.append('<style>' + CSS + '</style>')
    parts.append('<h1>8 × 8 矩阵</h1>')
    parts.append(
        '<p class="lede">7 阶段 + 管理，横切 8 层数据流水线。<b>' + str(len(cells)) + ' 格有内容</b>，'
        + '64 个位置里剩下的 ' + str(64 - len(cells)) + ' 格是<b>本来就该空的</b>——'
        + '需求阶段不选数据源，呈现层没有交付就没有运营。每一格的状态由脚本算出来，不手填。</p>')

    parts.append('<div class="note"><b>看这张图最该做的一件事：比较两行。</b>'
                 '验收行 8 格里有 6 格是 <b>验</b>，而开发行 8 格全是 <b>约</b>。'
                 '意思是「知道怎么检查」比「真的建出来了」进展更快——'
                 '这是三条链先做验收、后补实现的顺序造成的，也是它值得先做的理由。</div>')

    if doc.get('problems'):
        parts.append('<div class="note warn"><b>矩阵自身有问题 ' + str(len(doc['problems'])) + ' 条</b><ul>'
                     + ''.join('<li>' + p + '</li>' for p in doc['problems']) + '</ul></div>')

    parts.append('<div class="mt-chips">' + chips + '</div>')
    parts.append('<div class="mt-chips">' + chain_chips + '</div>')
    parts.append('<p class="mt-legend">点一格看它的三件事与检查器，再点一次取消。' + legend + '</p>')
    parts.append('<div class="mt-wrap"><div class="mt-grid"><table><thead>' + head
                 + '</thead><tbody>' + rows + '</tbody></table></div>')
    parts.append('<aside class="mt-panel" id="mt-panel"><h3>选一格</h3>'
                 '<p class="mt-meta">左侧任何一格都能点开。</p>'
                 '<div class="mt-field"><span class="k">这一页在说什么</span>'
                 '<span class="v">每格必须写三件事：<b>输入契约</b>、<b>输出契约</b>、'
                 '<b>失败模式</b>。三件事都必须可判定——「输出质量要高」不是契约，'
                 '「输出带 schema_version」是。</span></div>'
                 '<div class="mt-field"><span class="k">三个状态从哪来</span>'
                 '<span class="v">运行 <code>node scripts/matrix-check.mjs</code>。'
                 '它检查三件事齐不齐、检查器指向的脚本在不在、散文里的数字和它是否一致。'
                 '页面只渲染它算出来的结果。</span></div></aside></div>')

    parts.append('<h2>八跳衔接</h2>')
    parts.append('<p class="h2sub">格子之间的一致性原来没人管。现在它是一张有校验的表：'
                 '每一跳都要写清交的是什么、带哪些版本、下游怎么校验、断了会怎样；'
                 '缺任何一项 <code>matrix-check</code> 就报错。</p>')
    parts.append('<table class="mt-trans"><thead><tr><th>从</th><th>到</th><th>交的是什么</th>'
                 '<th>带哪些版本</th><th>下游怎么校验</th><th>断了会怎样</th></tr></thead><tbody>'
                 + trans_rows + '</tbody></table>')

    payload = {
        'cells': [{
            'stage': c['stage'], 'layer': c['layer'], 'kind': c['kind'],
            'status': c['status'], 'input': c['input'], 'output': c['output'],
            'failure': c['failure'], 'checker': c.get('checker'),
        } for c in cells],
        'transitions': doc['transitions'],
        'chains': doc['chains'],
    }
    parts.append(JS.replace('__DATA__', json.dumps(payload, ensure_ascii=False)))
    return ''.join(parts)


if __name__ == '__main__':
    doc = load()
    out = os.environ.get('STAGE_DIR')
    if not out:
        raise SystemExit('STAGE_DIR is not set. Run `node scripts/site/build.mjs`.')
    html = page('matrix', '8 × 8 矩阵', body_html(doc), crumb='数据产品 · 阶段 × 层')
    with open(os.path.join(out, 'matrix.html'), 'w', encoding='utf-8') as fh:
        fh.write(html)
    print('生成: matrix.html')
