---
name: native-agent-dev-eval
description: Stage 5 of the agent-product flow. Turn "seems to work" into measured, regression-gated quality — run the eval set, read scores honestly, and wire a gate that fails when quality drops. Use before shipping, after a model or prompt change, or when quality feels inconsistent.
disable-model-invocation: true
---

# Stage 5 — Harden

Exit test: **scores are recorded, the gate is wired, and the numbers are honest.**

"Honest" is doing real work in that sentence. Most eval suites in agent products
are worse than none, because a suite that always passes teaches the team to ignore
it, and then a real regression ships unnoticed.

## Run it

```
pnpm --filter @mas/evals eval            # full set
pnpm --filter @mas/evals eval --case <id>  # one case
```

Record every run to `packages/evals/runs/<date>-<label>.json` and commit it. A
score with no history cannot answer the only question that matters: *did this
change make it worse?*

## Read the scores honestly

Four questions, in order:

1. **Is any `should_fail` case passing that should not?** A guardrail that stops
   firing is a ship-blocker, regardless of every other number. Check this first,
   always.
2. **Which cases went down since the last run, and does the diff explain it?** A
   drop with no explanation is a regression even if the total improved.
3. **Is the total moving for the right reason?** Ten cases at 0.71 passing a 0.7
   bar is not the same as five at 0.95 and five at 0.45 — and the mean hides it.
   Look at the distribution, not the average.
4. **Is the judge agreeing with humans?** Sample two outputs the judge scored well
   and one it scored badly, and read them yourself. If you disagree, the rubric is
   wrong, and every number downstream is noise.

## The traps

**The flaky threshold.** If the same commit scores 0.68 then 0.74, the bar is
inside the noise. Either widen the case set until the variance is understood, or
pick a bar with margin. Never lower the bar to make a run pass — that is how a gate
becomes decoration.

**The judge that got easier.** Changing a judge prompt to be "fairer" is
indistinguishable from making it more lenient, and it silently recalibrates every
past score. Treat a judge-prompt change like a data migration: re-score the
previous run's outputs and state the delta before accepting it.

**The case that grew**. A case edited to accommodate a new behaviour is fine; a
case edited to accommodate a *worse* behaviour is a bar being lowered through a
side door. Read the diff on eval cases as carefully as the diff on code.

**The unrun suite.** An eval suite that only runs when someone remembers is not a
gate. It belongs in CI on the paths that can affect quality (prompt, tools, model
config, schemas) — and those runs must cost an amount you are willing to pay on
every PR. If they are too expensive, evaluate a subset per PR and the full set
nightly. Decide which, write it down, and wire it.

## Design the gate

A gate is a rule in CI that turns a quality drop into a red build. Minimum viable:

- Runs on every PR that touches `packages/core`, `packages/shared`, `packages/evals`, or a prompt.
- Fails if any `should_fail` case regresses. Non-negotiable.
- Fails if the deterministic pass rate drops below the recorded baseline.
- Warns (does not fail) on rubric-score drops, with the delta printed so the
  reviewer can judge.

Warning on rubric drops rather than failing is deliberate. Judge scores have
noise; a hard gate on a noisy signal gets muted within a month, and a muted gate is
worse than a soft one that stays on.

## Cost discipline

Eval runs are the largest recurring bill in most agent products. Keep it visible:

- Record cost per run alongside scores. A quality gain that quintuples the eval
  bill is a product decision, not an engineering one — surface it.
- Cache aggressively at the fixture level: tool responses that are fake should be
  hard-coded, never re-fetched.
- Separate the cheap deterministic check (schema validity, banned terms — free)
  from the expensive judge pass. Run the cheap one on every commit; the expensive
  one per PR.

## Exit checklist

- [ ] Full eval set run, results committed to `packages/evals/runs/`
- [ ] No `should_fail` case passing when it should not be
- [ ] Score deltas vs. the previous run explained
- [ ] Two high-scoring and one low-scoring output read by a human
- [ ] The gate is wired in CI and its cost is known
- [ ] Baseline recorded, with the date and the model version it was measured on

Then: `/native-agent-dev-release`.
