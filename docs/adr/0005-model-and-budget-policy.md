# 0005. Pin the model, gate upgrades on the eval baseline, and use one budget ceiling

**Status:** accepted
**Date:** 2026-10-24

## Context

The product's quality is the model's judgement. Two problems follow:

1. **A model upgrade is a silent behaviour change.** The same prompt produces
   different recipes on a new model version. Without a baseline, "it feels better"
   is the only available judgement, and a regression ships as an improvement.
2. **There were two budget ceilings.** `config.ts` defaulted to `$0.50`;
   `PLAYBOOK.md` set a temporary protection cap of `$2.00`. Budget behaviour
   depended on which document a reader trusted.

`config.ts` also allowed `AGENT_MODEL` to override the model in any environment,
which is useful locally and dangerous in production.

## Decision

**Model.** Production runs use `claude-sonnet-4-6`, pinned as the default in
`config.ts`. Every `Run` records the model string, so a result can always be
traced to the model that produced it.

`AGENT_MODEL` remains for local experiments only. A deployed environment must not
set it; if it is set, the run still records the resolved model, and the eval
baseline records the model it was measured on.

**Upgrades.** Changing the production model requires, in one change:

1. Run all fourteen cases on the new model.
2. Every deterministic check passes on positive cases.
3. Every `shouldFail` case still refuses, with no exceptions.
4. Rubric scores are not below the previous baseline (per dimension, not only the
   mean).
5. Record a new baseline with the model version and date; keep the old one for
   comparison.

If any condition fails, the model does not become the default. A deliberate
trade-off (better quality on one dimension, worse on another) is recorded as a
superseding ADR, not as a quiet config change.

**Budget.** One ceiling: **$2.00 per run**, enforced twice — the SDK's
`maxBudgetUsd` and the in-loop check in `run-agent.ts` that interrupts before the
next expensive turn. `config.ts` defaults to `2.0`; `PLAYBOOK.md` references this
ADR rather than restating a number.

## Consequences

**Easier:** a quality change is attributable to a model version; a budget
conversation has one number; experiments stay possible without silently changing
production.

**Harder:** model upgrades take an eval run (cost and time) instead of a one-line
change. That is the point — the eval is the only thing that makes the upgrade a
decision rather than a guess.

**Accepted:** `$2.00` is a starting ceiling, not a measured one. After ten real
runs, record cost and p95 latency and revisit this number in a new ADR. Until
then, the ceiling protects against runaway spend, not against a merely expensive
run.

## What we would revisit

If the ten-run measurement shows p95 well below the ceiling, lower it; a ceiling
far above actual spend stops nothing. If it shows runs frequently hitting the
ceiling, the workflow is too expensive and the fix is the workflow, not a higher
number.
