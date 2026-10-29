import sys, json, collections, os
from build_shell import page, STAGES
from paths import out_dir
from map import MAP

# 文档里的数字从归属表数，不写字面量。
N_ROWS = len(MAP)


# ---------- 每个阶段的详细内容 ----------
# 结构：goal / gap / branches[(条件, 去哪, 说明)] / verify[(动作, 通过标准)] / order(代价排序理由)
DETAIL = {
'need': {
 'goal': '把「我想做个 X」变成一句话：谁在什么情况下用、用完他能做什么以前做不到的事。',
 'gap': 'covered',
 'gapnote': '这一步由 <code>anb-idea</code> 覆盖，完整。',
 'why': '这一步决定后面所有事。写错方向，后面每一步都在加固一个错误假设，而且越往后返工越贵。',
 'branches': [
   ('你说的是功能清单（"要有登录、能导出"）', '#b-func', '功能是解决方案，不是问题。跳过它会让你在验收时无从判断好坏。'),
   ('你说的是品类（"用 AI 做内容"）', '#b-cat', '品类不是用途。问：谁、在哪一天、用它做什么。'),
   ('你已经有一句话，但说不清"什么情况说明不该做"', '#b-falsify', '缺这一句，你后面无法判断自己是不是错了。'),
   ('你说得清用途和对象，但说不清"它给你什么"', '#b-hands-back', '第五句问的是他能做什么，不是这东西还给他什么。这两个不一样，而第二个没人会主动写。'),
   ('你的否定条件写着"做不出来就别做"，而你说"但人能判断出来"', '#b-human-vs-product', '"人能判断"不等于"产品能判断"。这两个一个听起来像另一个，而它们决定产品存不存在。'),
   ('你有清晰的一句话，且否定条件可测', '#b-next', '进入设计。'),
 ],
 'verify': [
   ('把六句念给一个不做这行的人，他能复述出用途、对象、以及它会还给他什么', '他能说出"所以你是在帮谁解决什么"，以及"所以你拿到手的是什么"'),
   ('你的否定条件是一个可以被测量的事件', '不是"如果没人用"，而是"如果 X 和 Y 不一致超过三成"'),
   ('否定条件里说的是"产品能做到",不是"人能做到"', '问一句：这个判断凭哪一条信息？说得出具体来源，条件没触发；只能答"经验"，条件已经触发了'),
   ('写下了"这一步需要谁参与"', '如果需要别人而你找不到，现在就记成未通过'),
 ],
 'skills': ['interview-me', 'anb-idea', 'grilling', 'grill-me', 'grill-with-docs', 'wayfinder', 'agent-delivery-router'],
 'docs': [('decision-tree.html', '决策树：三个问题定位到阶段'), ('failure-atlas.html', '失败图鉴：第五类「找不到≠不存在」在这里最常见')],
},
'design': {
 'goal': '把"以后改起来很痛"的六件事先定下来：流程里哪些步骤固定、哪些要临场判断；它必须拒绝什么；每一种情况该怎么答；它能不打招呼就做什么；模型动手时看到什么；每种结局下人拿到手的是什么。',
 'gap': 'covered',
 'gapnote': '这里曾经是空的：ANB 从"想法"直接跳到"能跑"。现在补上了六问方法论（<code>anb-design</code>），答案落成 <code>work/designs/D-xxx</code>，可以被 <code>work check</code> 校验。<br><br><b>最后两块是实测加上的</b>：把前四块交给一个 agent 去实现最窄的路，它的猜测集中在"产出到底长什么样"，而四块里没有一块回答它；而原来的"拒绝清单"一块装了两样东西——实测十一行里只有三行是禁令，其余八行是"这种情况该怎么答"。',
 'why': '设计阶段的错误不会当场报错。它会以"后面每改一次都很痛"的形式慢慢出现，而那时已经没人记得当初为什么这么定。四问的作用不是把设计做全，是把最贵的四个决定逼出来。',
 'branches': [
   ('你要判断这东西到底该不该用 agent', '#b-agent', '一个测试：能不能把决策树画出来。能画就是管线，画不出来才需要 agent。'),
   ('你说的是功能和技术选型，说不清它必须拒绝什么', '#b-refuse', '拒绝清单写不出具体输入的，是价值观，不是设计。它在验收时会被悄悄丢掉。'),
   ('它能发消息、删东西、付款或发布', '#b-perm', '按能不能撤销分三档，不按重要性。重要性你会排错，能不能撤销是事实。'),
   ('模型要自己决定调哪个工具', '#b-contract', '每个工具三行，第二行「什么时候别用」是重点，也是最常被省掉的。'),
   ('四问答完了，要动手了', '#b-done', '把四块交给一个 agent，数它不得不猜了几处。每一处都是一个洞。'),
   ('你的"拒绝清单"越写越长，而且大部分是"该怎么答"', '#b-prohibitions', '禁令是清单，应答规则是表格——形状不同。实测里有十一行，只有三行是真正的禁令。'),
   ('拒绝清单要对照的政策，散在好几处', '#b-scattered', '最常见也最麻烦的形态：既不是"有"，也不是"没有"。中间那件「拢成一份」的工作没人负责，而它跨会话。'),
   ('只有一个用户、只跑一次、只读不写', '#b-skip', '可以跳过，但写下"我跳过了，因为…"。'),
 ],
 'verify': [
   ('四块都写了，跳过的块写明理由', '「跳过：只读，没有动作」算写完；空白不算'),
   ('判断点写下来并命名了，不是只有一个数', '"三处"必须能指出是哪三处。只有一个数字时，两个人可以都同意"三"而指的是不同的三'),
   ('应答规则每一行的"该怎么答"，都落在动作权限表允许的动作里', '三轮实测里，三处硬矛盾全是跨块的：表格要求了权限表里不存在的动作，而没有任何东西会比较这两块'),
   ('把记录交给一个 agent 之后，它报的"哪几块互相冲突"是空的', '光是猜测量降到零不算完。跨块冲突不是零就等于没做完——它只会安静地传下去'),
   ('拒绝清单每一条都有具体输入和一个改做什么', '拿得出"输入 X → 必须改成 Y"，才可能在验收时变成一条检查'),
   ('动作清单按"能不能撤销"排，不按重要性', '中间那档写了数字额度，不是"合理范围内"'),
   ('把四块交给 agent，它问你的问题在三个以内', '它猜的每一处都是洞，补完再数一次'),
 ],
 'skills': ['anb-design', 'architecture-decision-records', 'domain-modeling', 'codebase-design', 'spec-driven-development', 'to-spec', 'writing-plans', 'to-tickets', 'api-and-interface-design', 'database-schema-designer', 'auth-implementation-patterns'],
 'docs': [('terms.html', '术语表：每个词配「坏了会怎样」'), ('capability-map.html', '能力图谱 A 域：领域建模与契约')],
},
'build': {
 'goal': '一条真实输入从头走到尾，出一个真实结果。不做功能，只做一条最窄的路。'
         '开工前跑 <code>node scripts/design.mjs constraints</code>：判断点要保持为判断，动作权限要实现成边界。',
 'gap': 'covered',
 'gapnote': '这一步由 <code>anb-runnable</code> 覆盖，核心纪律是"不许有任何假数据"。',
 'why': '这是最容易假装成功的阶段：界面有、按钮有反应、看起来通了，但背后是样例数据。',
 'branches': [
   ('跑通了，但结果来自样例/固定数据', '#b-fake', '这是第一类假信号的温床。换一个你自己随手找的真实输入再试。'),
   ('跑通了，但只对一种输入有效', '#b-narrow', '那不是跑通，是特判。换第二个说不上来的输入。'),
   ('跑不通，报错看不懂', '#b-error', '错误必须是句子，不是堆栈。这是产品问题，不是调试问题。'),
   ('真实输入跑通两次，结果都能给人看', '#b-next', '进入验收。'),
 ],
 'verify': [
   ('你自己用随手找的输入跑了一次', '不是它准备好的样例'),
   ('换一个你没预想过的输入，也跑通了', '两个都能跑，才算跑通'),
   ('失败时报的是一句人话，且退出码非零', '不是静默通过，也不是堆栈'),
 ],
 'skills': ['anb-runnable', 'implement', 'implement-spec', 'tdd', 'ponytail', 'karpathy-guidelines', 'reuse-first', 'prototype', 'using-git-worktrees'],
 'docs': [('failure-atlas.html', '失败图鉴：第二类「测的不是你的产品」全部在这一步发生')],
},
'verify': {
 'goal': '定下「什么算好」，并且让这个标准能自动跑。而且——必须亲眼看到它失败过一次。'
         '这一阶段的护栏检查来自设计记录：先跑 <code>node scripts/design.mjs refusals</code>，把每一行变成一条检查。',
 'gap': 'covered',
 'gapnote': '这一步由 <code>anb-judgeable</code> 覆盖，它是整条链路里唯一的硬门。这里不过，不许往下走。',
 'why': '没有这一步，后面每一次改动都是无法测量的。产品会安静地变差，而所有人都以为在变好。',
 'branches': [
   ('还没有任何检查', '#b-none', '先写五到十条判断标准，再改产品。顺序反了，检查只会描述现状。'),
   ('有检查，但从来没红过', '#b-neverfail', '一条从没失败过的检查不是检查。走「故意弄坏」。'),
   ('检查红了', '#b-red', '先问：是产品错了还是尺子错？实测中三条红的，三条全是测试自己写错。'),
   ('检查全绿，但你不确定结果好不好', '#b-green-bad', '这是另一类问题：机制可信 ≠ 产出可用。'),
   ('检查全绿，且空跑五次数字不动', '#b-pass', '进入交付。'),
 ],
 'verify': [
   ('你亲眼看到过一条检查变红，并能说出是哪条抓到的', '不是"应该有"，是"我看到了"'),
   ('被跳过的检查数为零，或者整体结论是"不完整"', '"跳过"绝不能算通过'),
   ('成功 + 各种失败原因 = 总数', '拆开加一遍，两分钟'),
 ],
 'skills': ['anb-judgeable', 'anb-check-break', 'anb-check-offline', 'anb-check-readback', 'anb-check-reconcile', 'anb-check-output', 'verification-before-completion', 'llm-evaluation', 'test-suite-health', 'code-review', 'security-review', 'diagnosing-bugs'],
 'docs': [('failure-atlas.html', '失败图鉴：七种误判里有六种在这道门上现形'), ('atlas-test-report.html', '实测报告：七个问句漏了哪一类'), ('anb2-report.html', '实测报告：三次「通过但理由错」')],
},
'ship': {
 'goal': '别人拿到一个地址就能用，不需要你在旁边。',
 'gap': 'covered',
 'gapnote': '这一步由 <code>anb-shipable</code> 覆盖，但它有一个我做不到的验收动作：换一台设备、让另一个人试。',
 'why': '这是你第一次从使用者的位置看它。前面每一步你都在里面，所有东西都是配好的。',
 'branches': [
   ('只有你能打开（本地地址）', '#b-local', '不是交付。密钥、数据、权限、域名四件事在你这里全配好了。'),
   ('别人能打开，但第一分钟就撞墙', '#b-wall', '最常见的：配额耗尽、权限不足、依赖缺失。'),
   ('能打开，也能用，但没人告诉你哪不好', '#b-nobody', '让一个人试，你只看不帮。他卡住的第一步就是下一步的工作。'),
   ('换一台设备打开过，另一个人用过', '#b-next', '进入运营。'),
 ],
 'verify': [
   ('用手机打开这个地址', '打得开才算交付'),
   ('另一个人在没有解释的情况下用了一次', '他问的每一个问题都是一个缺陷，不是文档缺口'),
   ('所有密钥来自环境，不在任何文件里', '全仓搜一次'),
 ],
 'skills': ['anb-shipable', 'anb-check-otherdevice', 'pr', 'deploy-checklist', 'deployment-patterns', 'milestone-report'],
 'docs': [('decision-tree.html', '决策树：怎么判断自己卡在交付还是别的地方')],
},
'operate': {
 'goal': '看得出它有没有被用、有没有变好、钱花在哪、出事时能不能查。',
 'gap': 'half',
 'gapnote': '这一步只有 <code>anb-observable</code> 覆盖技术侧的观测（跑几次、花多少、为什么失败）。产品侧——有没有人用、用了之后有没有变好——这套方法答不了。',
 'why': '没有这一步，你无法回答"这个产品到底成不成立"。而技术上的"全部正常"和产品上的"没人用"可以同时成立。',
 'branches': [
   ('你不知道它跑了多少次、失败多少次', '#b-blind', '先补三个数字，再谈别的。没有观测就加功能，等于在黑暗里挪。'),
   ('有记录，但总数和分项对不上', '#b-reconcile', '记录有洞。每一条其它结论都建立在这上面。'),
   ('数字正常，但不知道有没有人真的在用', '#b-nouser', '这是产品侧观测，需要埋点而不是日志。'),
   ('能回答"谁在用、用了多少次、哪里失败"', '#b-next', '进入迭代。'),
 ],
 'verify': [
   ('做三次，历史里有三条', '做 N 次数 N 条'),
   ('故意弄坏一次，能在记录里找到它和原因', '找不到就是记录有洞'),
   ('知道花了多少', '这个产品花的是 API 配额，不是 token——两个都要能看清'),
 ],
 'skills': ['anb-observable', 'observability-and-instrumentation', 'instrument-product-analytics', 'artifact-registry', 'tech-debt', 'deprecation-and-migration', 'repo-gc', 'ponytail-audit'],
 'docs': [('anb2-full.html', '第二次实测：观测手段污染了观测结果')],
},
'iterate': {
 'goal': '只留下真的用过的，改掉真的错的。先由运营给到的三个数字决定<b>改什么</b>，把结论落成 <code>R-</code> 或 <code>T-</code>；再决定<b>留下什么</b>做下个产品的起点。',
 'gap': 'covered',
 'gapnote': '这一步由 <code>anb-reusable</code> 覆盖，并且推翻了它自己的一条规则（"用过三次才抽"太严）。',
 'why': '迭代不是加功能，是去掉不该留的。判断标准是"上个产品用过吗"，不是"这个可能有用"。',
 'branches': [
   ('你要加一个新功能', '#b-add', '先问：它解决的是观测到的哪个问题？答不出来就是猜。'),
   ('你想抽一个通用模板', '#b-template', '判据不是"用了几次"，是"它的形状会不会随产品变"。'),
   ('一个东西你想保留，但说不清为什么', '#b-keep', '删掉。想不清理由的东西会成为下个项目的负担。'),
   ('有了真实使用数据，知道该改什么', '#b-next', '回到需求，开始下一轮。'),
 ],
 'verify': [
   ('每一项保留物都能说出"在哪个产品用过、用了几次"', '答不出来的删掉'),
   ('用模板开第二个产品，计时比第一个快', '更慢说明模板是负担'),
   ('复盘产出的每一项有 owner 和复查日期', '没有归属的改进项等于没有'),
 ],
 'skills': ['anb-reusable', 'retro', 'improve-codebase-architecture', 'triage', 'setup-matt-pocock-skills', 'consolidate-memory'],
 'docs': [('anb2-full.html', '第二次实测：阶段六的规则被自己的实验推翻')],
},
}

BRANCH_BODY = {
 'b-func': ('功能清单不是问题', '「要有登录」是解决方案。要问的是：登录是为了让谁做什么？如果答案是"让每一个用户只能看到自己的数据"，那么真正的问题是隔离，而隔离可以用别的方式解决。<br><br><b>怎么改</b>：每个功能后面追问一句"它让用户能做什么以前做不到的事"。答不上来的功能，先不做。'),
 'b-cat': ('品类不是用途', '「用 AI 做内容」等于没说。它可以是任何人做任何事。<br><br><b>怎么改</b>：问三个具体问题——谁、在什么情况下、他今天没有更好的办法是因为什么。第三个问题是关键，它决定了这个产品有没有存在理由。'),
 'b-falsify': ('缺一个可证伪的否定条件', '「如果没人用」不是否定条件，那是任何产品都成立的废话。<br><br><b>怎么改</b>：写一个可以被测量的事件。例："如果五个指标拼出来的结论，和资深从业者凭经验判断的不一致超过三成，那这些指标不承载判断。"这句话在产品做出来之后能被验证。'),
 'b-next': ('这一步过了', '进入下一步。如果这是一个大产品，建议在这里停下来，把这一步的产出写成文件——因为三个月后你会需要它。'),
 'b-adr': ('写 ADR，含放弃的选项', 'ADR 的价值不在于记录你选了什么，在于记录你<b>放弃了什么，以及为什么</b>。没有放弃选项的 ADR 是一份宣布，不是一份决策。<br><br>每条 ADR 至少要有：背景、考虑过的选项、决定、代价、什么情况下该重议。'),
 'b-tie': ('两个方案都合理时', '这是最容易犯错的位置：随手选一个，然后在实现时才发现不合适，于是用补丁掩盖，最后没人记得为什么是这样。<br><br><b>怎么改</b>：写 ADR，把两个方案各自"什么时候会赢"写清楚。如果实在分不出来，选更容易撤销的那个。'),
 'b-existing': ('改已有系统之前', '先理解现在的形状。不是读代码，是问：这个东西现在怎么工作、谁在用、哪部分改动会伤到人。<br><br>不做这一步的典型后果：改了一处，另一处坏了，而你不知道它们连着。'),
 'b-skip': ('可以跳过，但要写下来', '一次性脚本、只给自己用的工具、只读不写的工具，不需要完整设计。<br><br>判据不是"东西小"，是两个事实：<b>有没有不可撤销的动作</b>、<b>除你之外会不会有人用</b>。两个都没有，可以跳过；有一个，第二问就不能跳。<br><br>但必须写下"我跳过了设计，因为 X"。因为三个月后你会把它当正式项目维护，那时候没人知道当初为什么没有这份记录——而沉默和"想过但决定不问"在记录里长得一模一样。'),
 'b-agent': ('该不该用 agent，一个测试', '这个问题现在归需求阶段问（<code>anb-idea</code>），因为它是"你在做什么"的决定，不是"怎么实现"。<br><br><b>测试只有一个：你能不能把决策树画出来？</b>能写出步骤顺序和分支条件，它就是固定流程，应该做成管线——顺序确定、一次模型调用嵌在脚本里，更便宜、更快、更好查。只有当下一步取决于上一步返回什么、你列不出分支时，才需要 agent。<br><br>设计阶段会把这个数重新数一遍：判断点零到一处，就该退回管线。两个阶段问同一个问题不是重复——一个是决定，一个是复核，而复核经常推翻决定。'),
 'b-refuse': ('拒绝清单写成了价值观', '「要诚实」「不要有害」「保持品牌调性」——都对，但一条都测不了。<br><br><b>改法</b>：每条按「一个具体输入 → 它必须改做什么」重写。写不出具体输入，就先问一句：这个产品最容易被误用成什么样？<br><br>为什么这一步值钱：拒绝清单是设计阶段唯一能直接变成验收检查的东西。写成价值观的那些，会在验收阶段写检查时被安静地删掉——因为没人知道怎么测，于是不测。'),
 'b-perm': ('按重要性排权限，排错了', '「付款重要，所以付款要确认；读文件不重要，所以放行。」结果是：一条读文件的动作把全部客户记录导了出去，而 2 美元的扣款被拦住了。<br><br><b>按能不能撤销排，只有这一个标准</b>：<br>· 可撤销 → 放行<br>· 会被看见或花钱 → 放行，但记账并设额度<br>· 不可撤销 → 先问人<br><br>中间那档最容易被跳过，而真正的损失都在那：不是答错一次，是在有人看之前错了五十次。额度要写数字，「合理使用」不是额度。'),
 'b-contract': ('交接契约只写了"它做什么"', '只写"这个工具用来读品牌画像"，等于授权它在任何场景下用。<br><br><b>每个工具三行</b>：做什么 / <b>什么时候别用</b> / 失败时返回什么。<br><br>第二行是重点。agent 产品最常见的失败不是工具坏了，是一个正确的工具被用在了不该用的地方——而日志里每一行都正常，没有报错，没有异常，只是结果微妙地错了。<br><br>第三行决定一次失败是一个回合还是整轮运行：说清"这个 id 不存在，不要用同一个 id 重试"的工具，能把循环自己结束掉。'),
 'b-done': ('四问答完，用数问题来验收', '把四块交给一个 agent，不给任何别的上下文，让它实现最窄的那条路。<b>然后数它不得不自己猜的有几处。</b><br><br>零处：设计完成。每一处：都是一个洞，补上，再交一次，再数。<br><br>两轮是正常的。超过三轮说明不是写得不细，是缺了一整块。<br><br>这个验收的好处是它不靠感觉——「设计得清不清楚」是个意见，「它问了三个问题」是个数。'),
 'b-human-vs-product': ('「人能判断出来」不等于「产品能判断」', '否定条件最容易在这里失效。<br><br>实测里第二轮的信号是「如果归因做不了，就别做」。问到实际数据，第一反应是——<b>「平台数据里没有，但运营判断得出来」</b>。<br><br>那句话听起来像安慰。它不是：运营靠的是<b>经验</b>，而产品继承不了经验，经验也写不成规则。<b>信号已经触发，是那个回答把它盖住了。</b><br><br><b>怎么查</b>：问「他凭哪一条信息判断」。<br>· 指向另一个系统（仓库记录、承运商网站、往来邮件）→ 信号没触发，第一步是换输入<br>· 指向一次要去问人的沟通 → 产品只能做一半，说清是哪一半<br>· 指向经验（「看多了就知道」）→ <b>停机</b>'),
 'b-hands-back': ('说得清用途，说不清产出', '六句里最容易漏的一句：<b>「它给你什么」</b>。<br><br>第四句问的是「他能做什么以前做不到的事」——那是<b>能力</b>；而「打开之后我拿到手的是什么」是<b>产物</b>，两个不同的槽位。<br><br>这不是吹毛求疵。<b>实测过</b>：让一个 agent 扮演陌生人、只看这一页，它准确复述出了用途和对象（exit test 按字面是通过的），然后说——「不知道打开之后它给我的是什么」。<br><br><b>怎么改</b>：写成一个<b>能用手的名词</b>。「一份每句都标了依据哪条政策的回复草稿」，不是「更好的回答」。'),
 'b-prohibitions': ('「拒绝清单」越写越长', '禁令是<b>清单</b>：短，每条是一个「不要做」。应答规则是<b>表格</b>：每个具体输入一行，写它该怎么答。<br><br>这两样东西形状不同，装进同一个标题里就会被名字带偏。<b>实测过一次</b>：十一行里只有三行是真正的禁令，其余八行是「这种情况该怎么答」——而按标题去实现，会把「3 个月不能用、且不要给建议」那一行做成<b>升级</b>，可它明写不升级。<br><br><b>怎么改</b>：分两块。「拒绝清单」收尾时应该很短；如果它有十行，回去看一遍。'),
 'b-scattered': ('输入存在，但散在好几处', '这是最常见的真实形态，而方法原本没有它的位置。<br><br>需求阶段只问「政策完全不存在吗」——不存在就停机；设计阶段这一问则默认输入已经可用。<b>中间那种「存在、但散在平台后台模板 + 几封内部消息 + 主管的口头补充里」的形态，两边都不管。</b><br><br><b>怎么改</b>：先承认它，别跳过。「把它们拢成一份可对照的清单」是一件跨会话的工作，所以它是一张票，而这一块<b>在票做完之前是阻塞的</b>。<br><br><b>不要凭记忆写拒绝清单。</b>凭大家记得的东西拼出来的清单，是价值观画上了箭头——每一行都像真的，而且没人能指出哪一行是猜的。'),
 'b-fake': ('结果来自样例数据', '这是最危险的一种"跑通"：界面完整、按钮有反应、输出看起来合理，但背后是写死的。<br><br><b>怎么发现</b>：给它一个你自己随手找的真实输入（真的链接、真的文件、真的需求），看它给出什么。再用一个你说不上来的输入试第二次——第一次可能是被特判过的。'),
 'b-narrow': ('只对一种输入有效', '那不叫跑通，叫特判。<br><br><b>怎么发现</b>：换一个你没预想过的输入。如果它崩了或者给出荒谬结果，说明这条路径只为一个案例存在。<br><br>这不是要你做通用产品，是要你知道自己现在的东西能覆盖多大的范围。'),
 'b-error': ('错误看不懂', '用户看到一段英文堆栈，等于什么都没看到。<br><br><b>正确标准</b>：错误信息要说清三件事——哪一步失败了、为什么、用户能做什么。"出错了"不是错误信息。'),
 'b-none': ('一条检查都没有', '现在改产品是没有方向的：你不知道自己在改好还是改坏。<br><br><b>先做的事</b>：写下五到十条"什么样算好、什么样算坏"。每一条都要能变成一次自动检查——要么是能数的，要么是需要读一遍判断的。<br><br><b>关键顺序</b>：先写检查，再改产品。反过来的话，检查会变成"描述产品现在做什么"，那是一种永远不会失败的检查。'),
 'b-neverfail': ('检查从没红过', '一条从没失败过的检查，只有三种可能：没在跑、没接进判定、写得太松。<b>三种都长得像成功。</b><br><br><b>动作</b>：故意造一个违反它的结果，看它会不会红。如果还是绿的，这条检查是装饰。'),
 'b-red': ('检查红了', '先别让它修。<b>先问一句：你认为这是产品错了，还是测试错了？理由是什么？</b><br><br>实测中我遇到三条红的，三条全是测试自己写错——我把字符数算错、把排序预期写反。如果直接改代码去迁就错的测试，测试会变绿，而产品会变坏。'),
 'b-green-bad': ('全绿但结果不好', '这是两件不同的事：<b>机制可不可信</b>和<b>产出可不可用</b>。一个机制完全可信的工具可以稳定地输出垃圾。<br><br><b>动作</b>：先问"有没有一条检查是关于结果对不对的，还是全是关于程序有没有崩的"。然后让它给你看三个真实输入的输出。'),
 'b-pass': ('这一步过了', '但注意：过了这一步不代表产品好用，只代表你能判断它好不好。'),
 'b-local': ('只有你能打开', '本机地址、localhost、只在你的机器上有效。<br><br><b>这不是交付。</b>有四件事在你这里是配好的，在别人那里全是缺的：密钥、数据、权限、地址。它们不会在开发时报错，因为开发时它们本来就没被用到。'),
 'b-wall': ('别人一进来就撞墙', '最常见的四种：API 配额耗尽、权限不足、依赖没装、域名/证书问题。<br><br><b>怎么提前发现</b>：算一遍配额。如果一次使用消耗 N 次配额，而你只有 M 次，那第 M/N 个用户就会撞墙。这个算术在写完代码时就能做。'),
 'b-nobody': ('没人告诉你哪不好', '你需要一个人，在旁边看着他用，不说话。<br><br><b>看三件事</b>：他第一次点哪里、第一次停顿超过三秒在哪、他问了你什么。<b>每一个问题都是一个缺陷</b>，不是文档缺口。'),
 'b-blind': ('不知道它跑了多少次', '你缺三个数字：跑了多少次、失败多少次、为什么失败。<br><br><b>先有这三个，再谈别的。</b>没有观测就加功能，等于在黑暗里往前挪——你会一直走到撞墙才知道方向错了。'),
 'b-reconcile': ('总数和分项对不上', '这说明记录有洞：有请求开了头没结尾，或者被算了两次。<br><br><b>一个更隐蔽的版本</b>：你去看仪表盘的那次请求，自己也被计入了仪表盘。于是每看一次，数字就涨一次，而且只涨不跌。<br><br><b>动作</b>：把总数拆开加一遍。然后什么都不做，刷新五次，看数字会不会自己动。'),
 'b-nouser': ('不知道有没有人真的在用', '技术观测答不了这个。日志能告诉你"程序跑了"，不能告诉你"有人需要它"。<br><br><b>这是这套方法的边界</b>：它能让你不骗自己，不能让你不骗市场。要做产品侧观测，得埋点——谁在用、用了几次、在哪一步放弃。'),
 'b-add': ('要加新功能', '先问：它解决的是你在观测里看到的哪个问题？<br><br>答不出来，那就是猜。猜的功能不会被用，而且会挤占维护别人在用的功能的精力。<br><br><b>答出来了，就把它落成记录</b>：需求本身变了就写 <code>work/requirements/</code> 里的 <code>R-</code>，是新认领的工作就写 <code>work/tickets/</code> 里的 <code>T-</code>。这一步不是仪式——不落记录，结论就只活在这轮对话里，下一轮又从记忆开始，于是每隔几个月把同一件事重新学一遍。'),
 'b-template': ('想抽通用模板', '判据不是"用了几次"。<br><br><b>真正的判据是：这东西的形状会不会随产品变。</b>测试运行器的形状不变，抽出来两次就够；仓库骨架的形状每次都变，抽出来就是负担。<br><br>第二个判据：它要不要在每个产品里都重新验证一次"它可靠"。如果要，那抽取省的不是行数，是验证次数。'),
 'b-keep': ('想保留但说不清理由', '删掉。<br><br>没有理由的保留物会成为下个项目的负担，因为每个未来的决定都要塞进它的形状里。而且你会在三个月后忘记它为什么在那儿，于是没人敢删。'),
}

def stage_page(slug, name, oneline):
    d = DETAIL[slug]
    idx = [s[0] for s in STAGES].index(slug)
    num = f'{idx+1:02d}'

    gap_badge = {'covered': '<span class="tag t-must">方法论已覆盖</span>',
                 'half': '<span class="tag t-branch">半个覆盖</span>',
                 'gap': '<span class="tag t-gap">方法论未覆盖</span>'}[d['gap']]

    body = [f'<h1><span class="num">{num}</span>{name}</h1>']
    body.append(f'<p class="lede">{d["goal"]}</p>')
    body.append(f'<div class="note{" warn" if d["gap"]!="covered" else ""}">{gap_badge}　{d["gapnote"]}<br><br><b>为什么这一步重要：</b>{d["why"]}</div>')

    # 分支
    body.append('<h2 id="branches">什么情况走哪条路</h2>')
    body.append('<p class="h2sub">按<b>代价</b>排序，不按发生概率。先做便宜且能推翻结论的。点击跳到对应处理。</p>')
    # 「去」这一列显示括号里那张卡片的标题，不是锚点 id。
    # 原来直接印 `b-neverfail`，读者要想知道它是什么得先点过去——而这一列
    # 存在的意义正是「不点也知道会去哪」。
    rows = ''.join(
        f'<tr><td>{c}</td><td><a href="{a}">{BRANCH_BODY[a.lstrip("#")][0] if a.lstrip("#") in BRANCH_BODY else a.lstrip("#")}</a></td><td>{note}</td></tr>'
        for c, a, note in d['branches'])
    body.append(f'<table><thead><tr><th style="width:36%">如果</th><th style="width:20%">去</th><th>为什么</th></tr></thead><tbody>{rows}</tbody></table>')

    for c, a, note in d['branches']:
        key = a.lstrip('#')
        if key not in BRANCH_BODY:
            continue
        head, text = BRANCH_BODY[key]
        body.append(f'<div class="card" id="{key}"><h3>{head}</h3><p>{text}</p></div>')

    # 谁验
    body.append('<h2 id="verify">谁来验，怎么验</h2>')
    body.append('<p class="h2sub">每一行都是一个<b>你能亲手做的动作</b>。做不了就记成未通过，写明缺什么，不要用近似动作代替。</p>')
    vrows = ''.join(f'<tr><td>{a}</td><td>{s}</td></tr>' for a, s in d['verify'])
    body.append(f'<table><thead><tr><th style="width:52%">动作</th><th>通过标准</th></tr></thead><tbody>{vrows}</tbody></table>')

    # skill
    body.append('<h2 id="skills">这一步用到哪些 skill</h2>')
    # 不在 MAP 里的 skill 之前被静默丢掉：一个拼错的 skill 名会让这一行凭空消失，
    # 而页面看起来完好无损。缺了就报出来。
    missing = [s for s in d['skills'] if s not in MAP]
    if missing:
        raise SystemExit(f"{slug}: these skills are not in map.py, so the page would silently omit them: {missing}")
    sl = ''.join(f'<li><a href="skills.html#{s}"><code>{s}</code></a> — {MAP[s][2]}</li>'
                 for s in d['skills'])
    body.append(f'<ul>{sl}</ul>')

    # 这一步要写的表。方法论和样张是两个问题，两页分开，互相指向。
    body.append(f'<div class="note" style="margin:2rem 0 0"><b>这一步要写下来的东西。</b>'
                f'方法论讲的是「要问什么」，样张讲的是「答案记在哪一列」。'
                f'<a href="tables-{slug}.html">看 {name} 的表 →</a></div>')

    # 原文
    body.append('<h2 id="docs">原文与依据</h2>')
    body.append('<ul>' + ''.join(f'<li><a href="docs.html#{f}">{t}</a></li>' for f, t in d['docs']) + '</ul>')

    # prev/next
    prev = STAGES[idx-1] if idx > 0 else None
    nxt = STAGES[idx+1] if idx < len(STAGES)-1 else None
    pp = ['<div class="nextprev">']
    pp.append(f'<a href="{prev[0]}.html"><span class="lbl">上一步</span>{prev[1]}</a>' if prev else '<span></span>')
    pp.append(f'<a href="{nxt[0]}.html" style="text-align:right"><span class="lbl">下一步</span>{nxt[1]}</a>' if nxt else '<span></span>')
    pp.append('</div>')

    crumb = '<a href="./">总览</a> / ' + name
    sections = [('branches', '走哪条路'), ('verify', '谁来验怎么验'),
                ('skills', '用到哪些 skill'), ('docs', '原文与依据')]
    return page(slug, name, '\n'.join(body), crumb, '\n'.join(pp), sections)

# ---------- 首页 ----------
def index_page():
    b = []
    b.append('<h1>Agent Native Builder</h1>')
    b.append('<p class="lede">一套给<b>不写代码的产品开发者</b>用的方法：七个阶段、一组能亲手做的检查、以及每个阶段可能会怎么骗你。<br><br>整套东西只有一个目标——<strong>让你能判断自己做的东西是真的能用，还是只是看起来能用。</strong></p>')

    b.append('<div class="cover">')
    b.append(f'<div class="row"><span class="k">它是什么</span><span class="v">七种误判、七阶段执行顺序、{N_ROWS} 个 skill 的归属表、以及两次完整实测的记录。</span></div>')
    b.append('<div class="row"><span class="k">它不是什么</span><span class="v">不是教你写代码。代码由 agent 写。它只解决「你怎么知道它做对了」。</span></div>')
    b.append('<div class="row"><span class="k">它的边界</span><span class="v">能让你不骗自己，<b>不能让你不骗市场</b>。产品有没有人要，这套方法答不了。</span></div>')
    b.append('</div>')

    b.append('<h2>七个阶段</h2>')
    b.append('<p class="h2sub">按执行顺序。每一页都告诉你：这一步做什么、什么情况走哪条路、谁来验、用到哪些 skill、原文在哪。</p>')
    cards = []
    for (slug, name, one), i in zip(STAGES, range(1, len(STAGES) + 1)):
        d = DETAIL[slug]
        gap = {'covered': '', 'half': '<span class="tag t-branch">半个覆盖</span>', 'gap': '<span class="tag t-gap">未覆盖</span>'}[d['gap']]
        cards.append(f'<a class="card" href="{slug}.html" style="display:block;text-decoration:none;color:inherit">'
                     f'<div style="font-family:var(--serif);color:var(--accent);font-size:1.5rem;line-height:1">{i:02d}</div>'
                     f'<h3 style="margin:.35rem 0 .3rem">{name} {gap}</h3>'
                     f'<p style="margin:0;font-size:.9rem;color:var(--muted)">{one}</p></a>')
    b.append('<div class="grid three">' + ''.join(cards) + '</div>')

    b.append('<h2>从这里进</h2>')
    b.append('<div class="grid two">')
    b.append('<a class="card" href="agent-graph.html" style="display:block;text-decoration:none;color:inherit"><h3>Main Agent 能力图谱</h3><p style="margin:0;font-size:.9rem;color:var(--muted)">4 条轴、17 个核心能力节点与 14 条咨询急诊路线，将方法体系变成可运行的咨询 Agent。</p></a>')
    b.append('<a class="card" href="matrix.html" style="display:block;text-decoration:none;color:inherit"><h3>数据产品的 8 × 8 矩阵</h3><p style="margin:0;font-size:.9rem;color:var(--muted)">7 阶段 + 管理 × 8 层。每格写输入契约、输出契约、失败模式；状态由脚本算出，不手填——<b>验</b> 有检查器，<b>约</b> 只有契约。</p></a>')
    b.append('<a class="card" href="data-design.html" style="display:block;text-decoration:none;color:inherit"><h3>数据产品设计（Momcozy）</h3><p style="margin:0;font-size:.9rem;color:var(--muted)">自顶向下设计全景：双向固定效应面板模型、三前置发现与 C1–C4 四级结论卡。</p></a>')
    b.append('<a class="card" href="data-layers.html" style="display:block;text-decoration:none;color:inherit"><h3>8+3 层级契约与检查器</h3><p style="margin:0;font-size:.9rem;color:var(--muted)">八个工序层输入输出契约、三条只追加不变量与命令级检查器规范。</p></a>')
    b.append('<a class="card" href="branches.html" style="display:block;text-decoration:none;color:inherit"><h3>分支总表</h3><p style="margin:0;font-size:.9rem;color:var(--muted)">所有 if/else 集中一页，按代价排序。不知道自己在哪一步时，先看这里。</p></a>')
    b.append(f'<a class="card" href="skills.html" style="display:block;text-decoration:none;color:inherit"><h3>Skill 全表 · {N_ROWS} 个</h3><p style="margin:0;font-size:.9rem;color:var(--muted)">三层来源、七阶段归属、每个都要说清「它坏了会怎样」。</p></a>')
    b.append('<a class="card" href="prompts.html" style="display:block;text-decoration:none;color:inherit"><h3>提示词库</h3><p style="margin:0;font-size:.9rem;color:var(--muted)">可直接复制的会话提示词，按阶段和用途分类。</p></a>')
    b.append('<a class="card" href="docs.html" style="display:block;text-decoration:none;color:inherit"><h3>原始文档</h3><p style="margin:0;font-size:.9rem;color:var(--muted)">八份未改一字的原始 HTML：失败图鉴、决策树、术语表、能力图谱、实测报告。</p></a>')
    b.append(f'<a class="card" href="manage.html" style="display:block;text-decoration:none;color:inherit"><h3>管理</h3><p style="margin:0;font-size:.9rem;color:var(--muted)">横跨七阶段的记录层：票据、事故、证据、设计记录各有归属，状态就是目录，<code>ls</code> 即看板。</p></a>')
    b.append('</div>')

    b.append('<h2>这套方法自己的证据</h2>')
    b.append('<p>它不是推演出来的。下面每一条都在仓库里可查：</p>')
    b.append('<table><thead><tr><th style="width:30%">证据</th><th>说明</th></tr></thead><tbody>'
             '<tr><td>七种误判</td><td>其中四条来自一个真实 agent 产品项目的实际运行：护栏把服务 502 记成「成功拒绝」、评测台自坏、预算检查恒假、截断超限 26 字符。</td></tr>'
             '<tr><td>第五类「找不到≠不存在」</td><td>我自己犯的：把「目录里没有」写成「根本不存在」，还配了一段听起来很有说服力的推理。</td></tr>'
             '<tr><td>第六类「测量污染」</td><td>用这套方法做第二个产品时发现：每看一次仪表盘，数字就变一次。</td></tr>'
             '<tr><td>两次完整实测</td><td>两个可运行样本，共 66 条检查，全部可以失败。<a href="docs.html#atlas-test-report.html">第一次</a> · <a href="docs.html#anb2-full.html">第二次</a></td></tr>'
             '</tbody></table>')
    return page('index', '总览', '\n'.join(b))

def notfound_page():
    # nginx 的 error_page 指向这一页。默认 404 会带服务器版本和一行死气沉沉的
    # 「Not Found」；这一页至少告诉访客站里有什么、往哪走。
    b = ['<h1>404 <span style="font-size:.5em;color:var(--faint);font-family:var(--sans);font-weight:400">这一页不存在</span></h1>']
    b.append('<p class="lede">地址打错了，或者这一页被移走了。<b>本站的每一页都可以从总览走到</b>，'
             '下面几个入口覆盖了大部分来意。</p>')
    b.append('<div class="grid two">')
    for slug, label, one in [('index', '总览', '七个阶段、管理、十三个表、提示词库的入口')] + list(STAGES[:3]):
        href = './' if slug == 'index' else f'{slug}.html'
        b.append(f'<a class="card" href="{href}" '
                 f'style="display:block;text-decoration:none;color:inherit"><h3 style="margin-top:0">{label}</h3>'
                 f'<p style="margin:0;font-size:.9rem;color:var(--muted)">{one}</p></a>')
    b.append('</div>')
    b.append('<p style="margin-top:1.6rem"><a href="./">回总览 →</a></p>')
    return page('404', '404', '\n'.join(b), desc='页面不存在 · Agent Native Builder')


if __name__ == '__main__':
    OUT = out_dir()
    open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(index_page())
    open(os.path.join(OUT, '404.html'), 'w', encoding='utf-8').write(notfound_page())
    for slug, name, one in STAGES:
        open(os.path.join(OUT, f'{slug}.html'), 'w', encoding='utf-8').write(stage_page(slug, name, one))
    print('生成:', 2 + len(STAGES), '页')
