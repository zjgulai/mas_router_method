import sys, os
from build_shell import page, STAGES
from paths import out_dir

def manage_page():
    b = ['<h1>管理 <span style="font-size:.5em;color:var(--faint);font-family:var(--sans);font-weight:400">横跨七阶段</span></h1>']
    b.append('<p class="lede">管理不是第八个阶段，是<b>七阶段的地基</b>。票据在需求时开，状态在开发时流转，'
             '证据在验收时落地，事故可能发生在任何一刻。把它抽成"第八步"，前七步就都在没有记录的情况下跑完了。</p>')

    b.append('''<div class="note warn"><b>为什么必须有这个。</b>
这个仓库曾经有一套票据系统——五张票，结构规范，还定义了状态字段。结果是：其中两张票要求的代码早就写完并通过测试，
票上还写着 <code>ready-for-agent</code>。<b>系统没坏，只是没人更新。</b>
管理层的唯一目的，是让"现在的真实状态"不需要任何人记得去维护。</div>''')

    b.append('<h2>一条铁律</h2>')
    b.append('<p><b>每一类信息只有一个家。可以被多处引用，不能被复制。</b></p>')
    b.append('<p>复制不会立刻出错。它会先安静地存两份，等改了一个忘了另一个时才出问题。这个仓库已经犯过一次：'
             '执行票同时住在 <code>.scratch/</code> 和 <code>work/tickets/</code>。</p>')

    b.append('<h2>判断标准只有一个：它会不会变</h2>')
    b.append('<table><thead><tr><th style="width:12%"></th><th>会变</th><th>不会变</th></tr></thead><tbody>'
             '<tr><td>特征</td><td>有状态、会流转、会关闭、会过期</td><td>写完就不该再动</td></tr>'
             '<tr><td>住哪</td><td><code>work/</code></td><td><code>docs/</code></td></tr>'
             '<tr><td>例子</td><td>票从 open 走到 done、事故从 open 到 closed、产物会过期</td><td>ADR 接受后不改、规格是某一版的快照</td></tr>'
             '</tbody></table>')
    b.append('<p style="margin-top:1rem">这条比"按主题分"可靠。按主题分的话，"决策"既像工作又像文档，每次都要重新吵一遍；'
             '按"会不会变"分，"ADR 接受后就不该改"是一个明确的事实，不需要判断。</p>')

    b.append('<h2 id="m-registers">八个寄存器</h2>')
    rows = [
        ('<code>work/requirements/</code>', '需求：一句话承诺', 'drafting → confirmed → dropped', 'R-', '需求'),
        ('<code>work/designs/</code>', '设计记录：四问的答案', 'drafting → confirmed → superseded', 'D-', '设计'),
        ('<code>work/tickets/</code>', '执行票：跨会话的工作单元', 'open → in-progress → awaiting-verification → done', 'T-', '开发–交付'),
        ('<code>work/incidents/</code>', '事故：计划外发生的事', 'open → contained → closed', 'INC-', '任何阶段'),
        ('<code>work/artifacts/</code>', '有持续成本的东西', 'active → expired', 'ART-', '运营'),
        ('<code>work/evidence/</code>', '证据：命令 + 原始输出', '<b>无状态，只增不改</b>', 'E-', '验收'),
        ('<code>work/receipts/</code>', '回执：谁收到了什么', '<b>无状态，只增不改</b>', 'REC-', '交付'),
        ('<code>docs/adr/</code>', '决策记录', '<b>无状态机，永久保留</b>', 'ADR', '设计'),
    ]
    b.append('<table><thead><tr><th style="width:24%">目录</th><th style="width:26%">放什么</th><th style="width:26%">流转</th><th style="width:8%">ID</th><th>谁写</th></tr></thead><tbody>'
             + ''.join(f'<tr><td>{a}</td><td>{c}</td><td>{d}</td><td>{e}</td><td>{f}</td></tr>' for a, c, d, e, f in rows)
             + '</tbody></table>')

    b.append('<h2>为什么设计记录在 work/ 而不是 docs/</h2>')
    b.append('<p>这条最容易搞反。ADR 在 <code>docs/adr/</code>，因为它接受之后就不该再改——说"这个 ADR 现在是 done"没有意义。'
             '设计记录在 <code>work/designs/</code>，因为<b>它会变</b>：起草、确认、被推翻。<code>superseded</code> 是它真正的常态，'
             '而一个只会被覆盖的东西需要状态机。</p>')
    b.append('''<div class="card"><h3>它校验什么，为什么是这四条</h3>
      <p><code>work check</code> 对每条设计记录查四件事——正好对应四问：</p>
      <table><thead><tr><th style="width:26%">块</th><th>不合格的写法</th><th>为什么这算不合格</th></tr></thead><tbody>
      <tr><td>流程形状</td><td>空着</td><td>没写，说明没问过；固定步骤和判断点没分开，验收阶段就没法判断该不该用 agent</td></tr>
      <tr><td>拒绝清单</td><td>「要诚实」「不要有害」</td><td>写不出具体输入，验收时没法变成检查，会被安静删掉</td></tr>
      <tr><td>动作权限</td><td>整块空白</td><td>跳过可以，但要写「跳过：只读」；沉默和"想过但决定不问"在三个月后读起来一样</td></tr>
      <tr><td>交接契约</td><td>只写"它做什么"</td><td>等于授权模型在任何场景下用</td></tr>
      </tbody></table>
      <p style="color:var(--faint);font-size:.88em">另有一条：标了 confirmed 却没写"什么情况说明这个设计错了"的记录会失败。
      没有重议条件的设计，三个月后没人敢动它，因为没人记得它当初假设了什么。</p></div>''')

    b.append('<h2>两个设计决定，都不显然</h2>')
    b.append('<div class="grid two">')
    b.append('''<div class="card"><h3>状态是目录，不是文字</h3>
      <p>旧票据写 <code>**Status:** ready-for-agent</code>——纯文本，没人校验，所以漂移了。</p>
      <p>现在票住在 <code>work/tickets/open/</code>、<code>work/tickets/done/</code>。<b>移动文件就是改状态</b>，
      状态无法与文件位置矛盾，<code>ls</code> 就能看全局。</p>
      <p style="color:var(--faint);font-size:.88em">代价：改状态要移动文件，所以有 <code>work-move</code> 命令先校验转移是否合法。</p></div>''')
    b.append('''<div class="card"><h3>证据是可复跑的命令，不是一句"已完成"</h3>
      <p>一份证据长这样：一条命令 + 它的原始输出 + <b>它能证明什么</b> + <b>不能证明什么</b>。</p>
      <p>最后两段是重点。"通过"这个词太容易写，而"这条测试证明了解析器，不能证明供应商可达"是真话。</p>
      <p style="color:var(--faint);font-size:.88em">票要标 done，<code>work-move</code> 会检查 <code>evidence:</code> 字段；没有就拒绝。</p></div>''')
    b.append('</div>')

    b.append('<h2 id="m-use">怎么用（不需要记命令）</h2>')
    b.append('<p>一个 skill，<code>anb-manage</code>。你说话，它读写目录。</p>')
    # 每行带 id：分支总表要能跳到具体某一个用例，而不是只跳到这一页。
    prompts = [
        ('m-status', '「现在什么情况？」', '跑 <code>work status</code>，按它的输出回答，不凭记忆总结成"看起来还行"。'),
        ('m-close', '「这张票能关了吗？」', '查三件：有证据吗、证据证明的是这张票还是别的东西、有没有一条检查真的红过。'),
        ('m-file', '「这里有个问题」', '先分辨是"我们打算做的事"还是"发生在我们身上的事"——前者开票，后者开事故。'),
        ('m-where', '「这个东西该放哪？」', '读 <code>work/LAYOUT.md</code>。它会不会变？会 → <code>work/</code>；不会 → <code>docs/</code>。'),
    ]
    b.append('<table><thead><tr><th style="width:32%">你说</th><th>它做什么</th></tr></thead><tbody>'
             + ''.join(f'<tr id="{i}"><td>{a}</td><td>{c}</td></tr>' for i, a, c in prompts) + '</tbody></table>')

    b.append('<h2 id="m-commands">几条命令，都可以当 CI 门禁</h2>')
    b.append('<pre>node scripts/work.mjs check    # 记录本身是否合法：ID 唯一、done 有证据、needs 指向存在\nnode scripts/layout.mjs        # 文件是否在 LAYOUT.md 说的位置</pre>')
    b.append('<p><code>work check</code> 在一个票标 done 却没有证据时会拒绝；<code>facts --check</code> 在文档引用了过时的数字时会拒绝；<code>naming check</code> 在某个 skill 把阶段写成编号时会拒绝。<code>layout check</code> 在一个文件放错目录时会报错。'
             '两个都返回非零退出码，能直接当门禁用。</p>')

    b.append('''<div class="note"><b>这套东西自己出过三次错，都是同一个形状。</b><br><br>
      一、<code>work status</code> 里硬编码了 <code>ticket</code>，而 schema 写的是 <code>tickets</code>——五张票全部不可见，报告说"0 张票，一切正常"。<br>
      二、schema 解析器的正则只匹配 <code>[A-Za-z0-9_]</code>，带连字符的 <code>in-progress</code> 和 <code>awaiting-verification</code> 被丢掉——票永远到不了 done。<br>
      三、<code>check</code> 统计时漏掉了 append-only 寄存器——五张票加三份证据，它报"5 条记录"。<br><br>
      <b>三次都没有抛错，三次都给出了自信的错误输出。</b>每一个都有测试锁住，而测试是通过"临时把 bug 注回去、看它会不会红"来验证的。</div>''')

        # 指向最后一个阶段，但用它的 slug，不写死文件名——文件名会随阶段改名而变。
    pp = (f'<div class="nextprev"><a href="/mas_router_method/site/{STAGES[-1][0]}.html">'
          '<span class="lbl">上一个阶段</span>迭代</a></div>')
    return page('manage', '管理', '\n'.join(b), '<a href="/mas_router_method/site/">总览</a> / 管理', pp)

if __name__ == '__main__':
    open(os.path.join(out_dir(), 'manage.html'), 'w', encoding='utf-8').write(manage_page())
    print('manage.html 生成')
