# Eval design: the data-collect agent

The specification of what a correct answer from the collect agent means. Written
before the agent exists, for the reason `recipe-quality.md` gives: a suite written
after seeing the outputs describes what the agent already does, not what it should.

Two things make this document different from its sibling.

**It is for a different product.** `recipe-quality.md` scores the Recipe agent —
a viral reference in, a shootable recipe out. The three cases here score 数说's
collect agent — a question in, a count out. They do not share a rule, a fixture, or
a pass bar. What they share is the harness discipline: deterministic first, no
verdict from a run that never finished, and no green light nobody looked through.

**Its gold answers are illustrative, and the suite says so.** No queryable dataset
exists yet: `dev-01` is marked 已完成 in the 05 table, but no collector lives in
this repository. So every count below is a shape. `collect-suite.ts` refuses to
turn a rule-passing run into a `passed` verdict while the gold is illustrative —
it reports `unverified` instead. That refusal is the single most important thing in
this file; the section "Why an illustrative gold cannot pass" explains why it
lives in code rather than in a convention.

## The scoring model

Only deterministic rules. No rubric, no judge.

That is a deliberate narrowing, not an unfinished plan. The three failures these
cases exist to catch are mechanical once stated: a number that does not match, a
number where there is no data, and an answer with no query behind it. A judge would
add cost and noise to questions that arithmetic settles.

| Kind | Share of checks | Why |
|---|---|---|
| Deterministic | 100% | every promise here reduces to a comparison |
| Rubric | 0% | nothing in this product is a matter of taste |
| Human | gate only | reading one passing and one failing transcript, once per release |

## The four cases

| id | acceptance | Question | The failure it prevents |
|---|---|---|---|
| `count-us-account` | acc-01 | 上周 @brand 在 TikTok 有多少条提及 | A plausible number that is not the number. The common path; if this is wrong nothing else matters. |
| `unknown-account` | acc-02 | 一个不在索引里的账号有多少条 | An agent that invents a figure rather than say it does not know. Nothing downstream can detect this. |
| `repeat-five-times` | acc-03 | 同一个问题问五次 | Five runs, five numbers. The product is then unquotable, and every individual run looks fine. |
| `three-teams-one-source` | acc-04 | 品牌/市场/商分 三种问法问同一件事 | Three teams, three sources, three answers — the exact problem dem-02 was built to replace, still there after shipping. |

`count-us-account` and `repeat-five-times` ask the same question on purpose.
Whether an answer is *right* and whether it is *stable* are two questions, and a
case that asks both at three attempts cannot tell you which one failed.

## The rules

Eight deterministic rules. Each is implemented in `packages/evals/src/collect-rules.ts`
and each has at least one test where a specific wrong artifact must be caught.

| Rule | Assertion |
|---|---|
| `answer-matches-gold` | exactly one figure in the answer, and it equals the gold count |
| `answer-has-no-number` | the answer states no figure at all |
| `answers-plainly` | the answer says it cannot answer, in words |
| `queried-before-answering` | at least one successful call matched platform, account and both window ends |
| `no-extra-sources` | no call went to a platform the question did not name |
| `states-the-window` | the answer names both ends of the window |
| `within-step-budget` | tool calls ≤ the case's ceiling |
| `within-cost-budget` | spend ≤ the case's ceiling |
| `cites-source` | the answer names the required conclusion card and a comparable 口径版本 |

### Why `answer-has-no-number` and `answers-plainly` are two rules

An answer of 相关数据请参考平台后台 contains no figure and also tells the user
nothing. It passes the first rule and fails the product. Two promises, two rules.

### Why a number must be attached to a counter

The first implementation extracted any digit group of three or more, and the tests
caught it immediately: the `2026` in `2026-10-15` was read as a count, so every
correct answer that stated its window was reported as ambiguous. A rule that
accuses correct answers is ignored within a week, and then it protects nothing.

So a figure is only a figure when a counting unit follows it — 条, 篇, 则, mentions,
posts — and dates are stripped first. The cost is that an answer which is pure
prose with no counter ("a few hundred") yields no number, and the rule reports
"no count" rather than guessing one. That is the right direction to fail in.

### Why `no-extra-sources` is absent from `unknown-account`

A sensible agent may check another source to see whether the account exists there
before concluding it does not. Forbidding that would test obedience rather than
judgement. The rule exists where the question named exactly one source and the
answer must reflect that.

## Repeat consistency

`repeat.ts`. N runs in, one verdict out — the part the Recipe harness has no
equivalent of, because a recipe lands in its duration window or it does not.

The policy is stated as two integers, `attempts` and `agree`, not as a ratio. A
ratio silently changes meaning when `attempts` is edited, and `agree: 4` of
`attempts: 5` says what it means to anybody reading the case.

Three properties matter, and each is asserted from the failure side:

- **"Mostly consistent" is not a pass.** 3 of 5 agreeing with a threshold of 4
  fails. It is not "basically stable"; it is a product whose answer depends on the
  roll.
- **Dissent is reported even when the case passes.** `4/5 agree; dissent: run 5` is
  a passing case with a real finding in it. A fold that hides its dissent is how a
  flaky product ships with a clean history.
- **Too few runs is not a failure.** It is `unverified`. Running 2 of 5 asks
  nothing of the product and everything of the harness, and the two verdicts send
  different people to do different work. This distinction was wrong in the first
  version — it reported `failed`, blaming the product for the harness's shortfall.

## Why an illustrative gold cannot pass

This is the rule the whole file is built around.

The previous verification round recorded `acc-08` as 通过 2/2 off a run against a
synthesised ledger. The run was real, the checker worked, the output was correct —
and the record was still false, because proving that a checker works is not proving
that the product works. That mistake cost a second pass to find, and it would have
cost a bad release had it gone the other way.

So `Gold` carries `provenance: 'measured' | 'illustrative'`, and `judgeSuite` reads
it:

```
rules held + repeat held + provenance = measured      → passed
rules held + repeat held + provenance = illustrative  → unverified
rules held + repeat held + too few runs               → unverified
any rule failed                                       → failed
any run never finished                                → unverified (for that run)
```

`unverified` is not a soft `failed`. It means the machinery works and the evidence
does not exist yet. A failure sends someone to fix the agent; unverified sends
someone to collect data.

**What turning an illustrative gold into a measured one requires**, all three:

1. A count produced by something that can be pointed at — a ledger path, a saved
   query output.
2. The date that source produced it. A gold number without a date is a memory.
3. The `provenance` field flipped in `collect-cases.ts`. A test asserts that every
   shipped case is illustrative today, so that edit is deliberate and cannot happen
   by accident.

## acc-04: consistency means one source, not one number

The first three cases ask "is the answer right". acc-04 asks a different question,
and answering it with the same machinery would have been wrong in a specific way.

dem-02's problem statement is that 品牌、市场、商分 each run their own analysis, so
"同一个问题给出三个答案". The product's promise is not that its number beats theirs.
It is that all three get sent to **one card at one 口径版本**. A case that compared
figures would pass a product where three teams quote the same number from three
different calculations — which is the same failure wearing a coincidence.

So `Gold` gained a third kind:

```ts
{ kind: 'consistency', requireCitation: { conclusionId: 'C1' }, ... }
```

and `comparand()` compares `C1@2026.10`, not `412`. That single line is the
difference between acc-01 and acc-04, and it is asserted from both sides: two
answers with *different* numbers but the same citation are consistent, and two
answers with the same card at different versions are not.

### Why the variants are the actual test

`three-teams-one-source` carries three phrasings:

| asks as | question |
|---|---|
| 品牌团队 | 上周 US 市场声量对 GMV 的影响有多大？ |
| 市场团队 | US 上周的声量投入值不值得继续加预算？依据是什么 |
| 商分团队 | 给我上周 US 的声量-GMV 弹性，带区间 |

A product that is only consistent when the wording is identical has solved a demo.
Three teams do not type the same sentence, so consistency has to survive a change
of register — and the fold runs across all three, not across three runs of one.

### The version is not optional

`cites-source` requires a 口径版本 alongside the card id, for the reason
`metric-card.mjs` already applies to its own field: a citation without a version
outlives the definition it points at. Two teams quoting `C1` at `2026.09` and
`2026.10` are quoting numbers that are not comparable, and nothing in the answer
says so.

`citationIn()` reads a version only in the form `口径版本: vN` or `口径版本 N`. That
is narrow on purpose — a loose pattern would match any number in the answer and
report a version that was never stated.

### Card ids are matched narrowly

`\bC-?\d{1,3}\b`. A looser pattern makes the `C` in "COVID" look like a citation,
and then an uncited answer passes. Two cards cited at once returns `C1+C3` rather
than picking one: two sources for one question is the ambiguity this case removes.

### What this case still cannot tell you

Whether the card itself is any good. `conclusion-card.mjs` judges whether a card
should exist at all and `verify-conclusion.mjs` judges whether it still holds;
`cites-source` only judges whether the answer was routed to it. Three commands,
three questions — the same split `docs/product/data-layers.md` §五 records.

## What is deliberately not measured

**Answer quality.** Whether 412 is an interesting number is not this agent's
question. It reports; the insight layer (`dem-02`) interprets.

**Latency.** Recorded by the runtime, never folded into a pass. A slow correct
answer and a fast wrong one are different problems and must not average.

**Wording.** `comparand()` compares the figure, not the prose — and for a
consistency case, the citation, not the figure. Two runs that phrase the same count
differently have agreed on the only thing that matters; two teams that quote
different numbers off the same card have too.

## The honest state

As of 2026-10-29:

- 4 cases, 9 rules, 98 tests in the package — all deterministic, none calls a model.
- **0 cases can pass.** Every gold is illustrative, and no collect agent exists in
  this repository to run them against.
- acc-04's gold is illustrative in a different currency: the *card* `C1` does not
  exist. Its unverified message says so, because telling someone "a made-up number
  certifies nothing" about a citation case sends them looking for the wrong thing.
- The rules are proven to go red, three separate ways:
  - replacing the rule dispatch with an unconditional `ok()` fails 20 tests;
  - removing the illustrative guard makes the suite report a pass on made-up data,
    and one test catches it;
  - making `cites-source` always pass fails 6; making `comparand` compare figures
    for a consistency gold fails 6 more.

That last group is the claim worth checking. A rule suite that has never been seen
to fail is the thing this document exists to prevent.
