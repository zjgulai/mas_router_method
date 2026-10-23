---
name: native-agent-dev-release
description: Stage 6 of the agent-product flow. Put an agent in front of real users with the operational surface it needs — cost ceilings, run visibility, an owner for failures, and a feedback loop back into the eval set. Use when shipping to a real user, pilot, or internal team.
disable-model-invocation: true
---

# Stage 6 — Ship

Exit test: **a real user has used it on real work, and someone owns the next
failure.**

Shipping an agent is different from shipping software in one specific way: it
keeps making new decisions after you deploy it. So the release checklist here is
weighted toward *observability and control*, not toward the deploy itself.

## The five things that must be true before a real user touches it

**1. Cost has a ceiling, enforced in code.** Not a dashboard, not an alert. A run
that crosses `maxCostUsd` stops. Know the number per run, and know the worst case
per day (runs × ceiling). If that worst case is unacceptable, lower the ceiling
before launch, not after.

**2. Every run is reconstructable.** The steps, the tool calls, the token counts,
the cost, the model version, the workflow version. When a user says "it gave me
something weird on Tuesday", you need to answer without asking them to reproduce.

**3. Failure is visible to the user, not just to you.** A failed run must say what
happened and whether retrying helps. An agent that silently returns nothing is
indistinguishable from one that is broken — and users forgive the first, not the
second.

**4. The guardrails are enforced at the tool layer.** Not in the prompt. A brand's
prohibited claims must be impossible to persist, not merely discouraged. Verify by
trying: run a `should_fail` case against production config.

**5. A named owner for the next failure.** Not "the team". A person. Agent products
degrade in ways that are invisible in aggregate metrics but obvious to the person
using them, so someone has to be reading the feedback.

## The surfaces

Two, with different jobs — resist the temptation to make one do both.

**The bot** (Feishu) is where the work happens. It meets users where they already
are, which is why it gets used. Keep it narrow: it does the workflow, it does not
have settings.

**The workbench** is where the work is supervised. Reviewing recipes, checking runs,
adjusting brand guardrails, reading eval scores. It is used by fewer people, more
deliberately. Its value is entirely in making the agent's behaviour legible — a
workbench that only shows a chat log is a chat app with extra steps.

The split matters because it decides where a feature goes. "Configure the brand
voice" is workbench. "Make a video from this link" is the bot. Anything that is
both is a workbench feature with a bot shortcut.

## Pilot, not launch

Ship to one brand, with a person who will tell you the truth. What you are
measuring in a pilot is not conversion — it is:

- What do they use it for that you did not anticipate?
- What do they do *after* it gives them a recipe? (The handoff is where products
  die: a recipe nobody can shoot is a failed product even if the recipe is great.)
- Which outputs do they rewrite, and does the rewrite pattern suggest a missing
  tool or a bad rubric?

Every rewrite is an eval case waiting to be written. Collect them daily for the
first two weeks; that single habit is the difference between a product that
improves and one that plateaued at launch quality.

## Versioning

Two versions matter in an agent product, and conflating them makes incidents
unreadable:

- **Workflow version** — what the agent was asked to do. Store it on every run.
- **Model version** — what was doing the asking. Store it on every run.

A quality drop is usually one of these two changing. Without both recorded, the
first question of every incident ("what changed?") has no cheap answer.

## Rollback

Know the answer before launch: if quality craters, what do you revert, and how long
does it take? For prompts and tool schemas, it is a commit. For a model upgrade, it
is a config change — and it must be possible *without* a deploy, or a bad model
rollout becomes a bad week.

## Exit checklist

- [ ] Cost ceiling enforced in code; worst case per day known
- [ ] Run reconstruction works: pick a random run, explain it
- [ ] Failure messages are actionable for a non-engineer
- [ ] Every guardrail verified against production config, not just in tests
- [ ] Workflow version and model version stored on every run
- [ ] One named owner for feedback, and a place the feedback lands
- [ ] One real user on one real brand, with a check-in scheduled for day 3 and day 10
- [ ] Rollback path known and rehearsed once

## After this

The loop does not end here. Every rewrite a user makes becomes a case in
`packages/evals`, which re-enters the flow at stage 2 for the next iteration. That
cycle — pilot, collect rewrites, add cases, improve — is the product. The initial
build is just the thing that gets the cycle started.
