---
name: native-agent-dev-build
description: Stage 4 of the agent-product flow. Implement a ticket and, when behaviour is wrong, find the layer that is actually wrong before changing anything. Use when building a slice, or when an agent behaves badly and the instinct is to tweak the prompt.
disable-model-invocation: true
---

# Stage 4 — Build

Exit test: **the ticket's behaviour passes its eval cases, not just its unit tests,
and the diff is reviewable.**

Use `/implement` for the mechanics (TDD at pre-agreed seams, typecheck often, run
the full suite once, then `/code-review`). This skill covers the part `/implement`
cannot: what to do when the *model* is the misbehaving component.

## The four layers

When an agent does the wrong thing, it is one of four layers. They have different
fixes, different owners, and wildly different costs. Guessing wrong is what turns a
one-hour fix into a two-week prompt-engineering project.

| Layer | Symptom | Fix | Bad fix |
|---|---|---|---|
| **Prompt** | Understands the task, but weights it wrong | Change instructions, examples | Adding more rules each time |
| **Tool contract** | Calls the right tool with the wrong arguments, or does not know when to call | Change the tool's schema or description | Telling it in the prompt to "use X for Y" |
| **Data** | Correct behaviour on correct inputs; garbage in | Fix the input, add validation | Loosening the schema until garbage passes |
| **Eval** | Output is fine but the score says otherwise | Fix the case or the rubric | Retraining the model |

**Diagnosis order: eval → data → tool → prompt.** Cheapest and most common first.
The instinct is the opposite, because prompt edits feel like progress and take one
minute to type. They also invalidate nothing you have already measured, which is
tempting and wrong.

## Diagnosing: the concrete procedure

1. **Reproduce as an eval case.** If you cannot make a failing case, you do not
   understand the failure yet. Do not fix what you cannot reproduce.
2. **Read the run's steps, in order.** What did the model actually see at the
   moment it went wrong? Most "the model is dumb" bugs are "the tool returned
   something confusing" or "the schema let a bad value through".
3. **Check the tool boundary first.** Did each tool return what the model needed,
   in a form it could act on? An error message the model cannot act on costs a turn
   and often produces a worse retry.
4. **Only then look at the prompt.** And when you do, change *one* thing, and re-run
   the whole eval set — not just the failing case. Prompt edits are the only change
   in this system that can silently break cases you were not looking at.

## Writing the code

- **Ports at the boundary.** Tools depend on interfaces (`BrandStore`,
  `VisionAnalyzer`), not on Prisma/Drizzle clients. This is what makes the eval
  harness able to run the real tool code with fake data.
- **Never throw from a tool.** Return `{ isError: true }`. A throw kills the run.
  `packages/core/src/tools/result.ts` gives you the shape; use it, do not re-invent
  it per tool.
- **Budget is enforced in the loop, not the prompt.** A prompt saying "be concise"
  is not a cost control. `maxBudgetUsd` plus an in-loop check is.
- **Every run persists its steps.** If a run cannot be explained after the fact,
  it is not debuggable, and agent bugs are notoriously non-reproducible.
- **Schemas validate at the boundary.** The model's output is untrusted input. A
  malformed recipe must fail at the schema, loudly, not become a weird card in the
  review queue.

## Testing: two different jobs

Both are required, and confusing them is common.

**Unit and integration tests** verify your code. They run in CI, must be fast, and
never call a model. The step-mapping function, the budget arithmetic, the schema
validation, the tool error paths — all of these are ordinary code with ordinary
tests.

**Eval runs** verify the agent's judgement. They call the model, cost money, and
are therefore *not* in the fast CI path. Run them when behaviour changed:
after a prompt edit, a tool-schema change, a model upgrade, or a data-shape change.

A ticket is not done when its unit tests pass. It is done when its eval cases pass.

## When the model genuinely cannot do it

Sometimes all four layers are fine and the task is simply beyond the current model
at acceptable cost. Before concluding that:

- Check whether the task can be decomposed — three focused calls often beat one
  ambitious one, and fail more explainably.
- Check whether a deterministic step can replace a generative one. Anything with a
  right answer should be code, not a model.
- Check whether the deliverable was too ambitious for this ticket. A weaker
  artifact that ships beats a stronger one that never converges.

Then write it down in the ADR. "We tried to have the model do X and it could not,
so we do Y" is one of the most valuable documents in an agent codebase, because it
stops the next person from re-litigating it.

## Exit checklist

- [ ] The failing behaviour is reproducible as an eval case
- [ ] Unit tests pass; the change is typechecked
- [ ] The ticket's eval cases pass, run against the real model
- [ ] No tool throws; failures are values
- [ ] The full eval set was re-run, not just the changed case
- [ ] `/code-review` has run on the diff
- [ ] Any "the model cannot do this" conclusion is recorded in an ADR

Then: `/native-agent-dev-eval` when the slice needs hardening, or the next ticket
from the frontier.
