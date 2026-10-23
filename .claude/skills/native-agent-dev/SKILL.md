---
name: native-agent-dev
description: Route an agent-product task to the right stage of this repo's workflow — from requirement clarification through spec, eval design, tracer ticket, implementation, and release. Use when starting any piece of work here, when unsure which skill applies, or when the user says "what's next", "where do I start", or "how do we build this".
disable-model-invocation: true
---

# Native Agent Dev

A router over this repo's agent-product workflow. It decides **which stage** a
piece of work is in, then hands off to exactly one stage skill.

A **stage** is a gate, not a checklist item. You leave a stage when its artifact
exists and its exit test passes. Skipping a gate is allowed — but it must be a
named decision, written down in the run or the ticket, because "we skipped evals"
is the single most common reason an agent product ships feeling unfinished.

## Read this first

Before recommending a stage, read the stage skill's `SKILL.md`. The summaries
below are for orientation only, and they go stale faster than the skills do.

If the work is *not* agent-product work — a plain refactor, a dependency bump, a
pure UI bug — use the vendored skills directly instead of this router
(`/diagnosing-bugs`, `/implement`, `/code-review`). This router exists for the
work that is genuinely agent-shaped, because that work has failure modes plain
software does not.

## The stages

| # | Stage | Skill | Exits when |
|---|---|---|---|
| 1 | Clarify | `/native-agent-dev-clarify` | The *job* is stated in the user's words, and the failure modes are named |
| 2 | Spec | `/native-agent-dev-spec` | An eval set exists and a human agrees it defines "good" |
| 3 | Ticket | `/native-agent-dev-tickets` | One tracer bullet runs end to end |
| 4 | Build | `/native-agent-dev-build` | The tracer passes its eval cases, not just its tests |
| 5 | Harden | `/native-agent-dev-eval` | Eval scores are recorded and the regression gate is wired |
| 6 | Ship | `/native-agent-dev-release` | A real user has used it and someone owns the next failure |

## How to route

Ask one question, then stop asking: **what does the user believe is blocking?**

- "I don't know what to build" / "the requirements are vague" → **1 Clarify**
- "I know what it should do, but not what good looks like" → **2 Spec**
- "The spec is agreed, where do we start coding" → **3 Ticket**
- "It's half-built and I want the next slice" → **4 Build**
- "It works in demos but not reliably" → **5 Harden**
- "It's ready, get it in front of people" → **6 Ship**

If the answer is "all of it", the first stage is 1. Always.

## The two rules that make this different from normal software

**Rule 1 — the eval is the spec.** For an agent, a prose spec is a wish. The
artifact that actually constrains behaviour is a set of input/expected-outcome
cases with a scoring rule. If stage 2 produced a spec with no eval set, it did
not finish. This is the one gate worth being pedantic about: everything
downstream measures against it, and a spec without evals means every later
argument about quality is an opinion.

**Rule 2 — the model is not the program.** When something is wrong, the first
question is *which layer*: prompt, tool contract, data, or eval. Four different
fixes, four different owners. `/native-agent-dev-build` carries the discipline for
telling them apart; do not let a run skip to "tweak the prompt" because that is
the cheapest-looking move.

## What "agent-shaped" means here

Work belongs in this flow when it has at least one of:

- A non-deterministic step whose output quality varies run to run.
- Tool calls whose *contract* (not implementation) shapes model behaviour.
- A cost or latency envelope that has to be enforced, not hoped for.
- A human in the loop who must be able to audit what happened.

If it has none of those, it is ordinary software and the vendored skills do it
better.

## Vocabulary

This repo converges on a specific set of words; use them exactly, because the
skills and the eval harness match on them.

- **Recipe** — the product artifact: a cloneable abstraction of a reference video, re-skinned for one brand.
- **Reference** — the source viral video. Its media is transient; its *analysis* is what we keep.
- **Analysis** — the structured reading of a reference (hook pattern, beats, shots, rights). Produced by exactly one tool.
- **Run** — one execution of a workflow. The unit of cost, audit, and retry.
- **Eval case** — an input plus the criteria that decide whether the output is acceptable.
- **Workflow** — a named, versioned sequence of stages the runtime executes.

`GLOSSARY.md` at the repo root is authoritative if these ever disagree.

## Where things live

```
docs/product/          product thesis and the argument for the product
docs/adr/              decisions and why they were made
docs/evals/            eval-set design and how scoring works
docs/agents/           config for the vendored engineering skills
packages/shared/       schemas the whole system agrees on — including the eval types
packages/core/         the runtime: agent loop, tool contracts, budget
packages/evals/        the eval harness and the cases themselves
apps/workbench/        the operator surface
apps/bot-gateway/      the Feishu surface
```
