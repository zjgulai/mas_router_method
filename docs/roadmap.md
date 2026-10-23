# Roadmap

Ordered by **risk**, not by dependency. The assumption most likely to be wrong is
tested first, because everything after it is wasted if it fails.

The riskiest assumption in this product: *a model can abstract a viral video well
enough that a brand's shooter would use the output*. Not "can it write a script" —
that is solved — but "does the abstraction survive the move to a different
category". If it does not, the product is an imitation engine with a legal problem
and no moat.

## Milestone 0 — the loop runs (current)

Everything here exists; see `CLAUDE.md`'s "Current state".

`packages/shared` schemas, `packages/core` runtime with budget enforcement and
step recording, tool contracts against ports, nine unit tests.

## Milestone 1 — first tracer: one recipe, end to end

The first ticket. Deliberately not "build the workbench" and not "build the Feishu
bot" — both would be horizontal slices that demo nothing.

**What it must contain** (all six, per `/native-agent-dev-tickets`):

1. A real TikTok URL goes in.
2. The model runs with the real system prompt.
3. It calls `get_brand_profile` and `analyze_reference_video` and gets real results.
4. The recipe is validated against `Recipe` and persisted.
5. The run's steps are readable — the timeline, not a log dump.
6. The eval harness runs one case against it and prints pass/fail.

**Deliberately excluded:** Feishu, authentication, multi-brand, the workbench UI.
Those are milestone 2 and 3. The first tracer earns the right to build them by
proving the abstraction works at all.

**Open question this ticket answers:** can the vision analyser produce a
`ReferenceAnalysis` that is both valid against the schema and *useful* — i.e. does
the recipe writer produce something better than it would have without it. That
comparison is the single most informative experiment in this roadmap, and it is
worth doing properly: same brand, same request, one run with the analysis and one
without, judged blind.

## Milestone 2 — the bot, one brand

Feishu gateway: event subscription, signature verification, @-mention handling,
result posted back to the thread. One brand, one internal user, real work.

The gateway is thin by design. It owns authentication, threading, and delivery; it
owns no agent logic. Everything it does is: verify, map a Feishu event to an
`AgentRunRequest`, call `runtime.run()`, post the result.

**Gate to leave:** the pilot user has used it three times without being asked to.

## Milestone 3 — the workbench, one operator

Recipe review (approve / reject / edit), run inspection (the timeline, cost, the
failure reason), brand guardrail editing, eval score visibility.

Built last on purpose. A workbench built before there are recipes to review is a
dashboard for an empty table, and its design will be wrong because nobody yet knows
what reviewers actually look at.

**Gate to leave:** a reviewer can answer "why does this recipe look like this" from
the workbench alone.

## Milestone 4 — the eval gate

Wire the suite into CI per `docs/evals/recipe-quality.md`. Record baselines with
model version. The rubric-score half warns rather than fails, for the reason given
in `/native-agent-dev-eval`: a hard gate on a noisy signal gets muted.

## Milestone 5 — second brand, second category

The abstraction claim gets its real test. One brand proves the workflow; two brands
in different categories proves the *product*. If the recipe-writing prompt needs
category-specific instructions, that is a finding about the product's ceiling, not
an implementation detail.

## Explicitly deferred

**Multi-platform.** The recipe model is TikTok-shaped. Porting to Reels means a
different duration grammar and a different hook economy; doing both at once means
neither is good.

**Video generation.** See the thesis's non-goals. It would make the deliverable as
unreliable as the weakest model capability in the chain.

**Team accounts and RBAC.** One operator per brand until a second person actually
needs access.

**Self-serve onboarding.** Brands are onboarded by us for now. Self-serve needs a
guardrail-editing UI that is good enough to trust a stranger with, which is a
milestone-3-or-later problem.

## How this roadmap changes

Every milestone's exit gate is a real user doing a real thing, not a feature being
built. If a gate is not met, the next milestone does not start — the honest move is
to go back to the previous stage of `/native-agent-dev` and find out which layer is
wrong, not to build the next thing and hope it compensates.
