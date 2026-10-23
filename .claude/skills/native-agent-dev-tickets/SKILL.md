---
name: native-agent-dev-tickets
description: Stage 3 of the agent-product flow. Break an agent spec into tracer-bullet tickets whose first slice proves the whole loop works — model, tool, schema, UI — before any slice gets deep. Use after the spec and eval set exist.
disable-model-invocation: true
---

# Stage 3 — Tickets

Exit test: **the first ticket, when done, will have run the real loop end to end
and produced a real artifact — even if it does it badly.**

Use `/to-tickets` for the slicing mechanics (tracer bullets, blocking edges,
publishing to the tracker). This skill adds the part that is specific to agent
products: what the *first* slice must contain, and the two prefactors that must
happen before any feature work.

## The first slice must be a full loop

In ordinary software, a tracer bullet goes through every layer. In an agent
product, "every layer" includes things that do not exist in ordinary software, and
missing one of them is how a project ends up with a beautiful runtime and no
product.

The first ticket's acceptance criteria must include all six:

1. A real request goes in — not a fixture from the test file.
2. The model runs, at least once, with the real system prompt.
3. It calls at least one **real tool** and gets a real result.
4. The result is validated against a **shared schema** and persisted.
5. A human can **see what happened** — the run's steps, readable.
6. The eval harness can run that one case and print a pass/fail.

If any of those six is deferred to a later ticket, the first ticket is not a
tracer bullet; it is a horizontal slice wearing a tracer bullet's clothes. The
classic version: "ticket 1 = runtime, ticket 2 = tools, ticket 3 = UI, ticket 4 =
persistence", which produces four weeks of work and zero demos.

## Prefactor 1: the shared schema

Before feature tickets, define the domain objects in `packages/shared` — brand,
reference, analysis, recipe, run. Every other package imports them.

Why this is a ticket of its own: retrofitting a shared type after two packages
have grown their own copies is a wide refactor across the whole codebase, and it
lands right when you have the most momentum to lose. Do it once, early, badly —
the schemas will change, but they will change in one place.

The schema ticket's acceptance criteria: every field is read by something. A field
no tool, UI, or eval reads is speculative, and speculative fields get trusted by
later code that should not trust them.

## Prefactor 2: the tool contract surface

Before the workflow tickets, implement the tools against **ports** — interfaces —
with in-memory fakes. Not the real Feishu API, not the real database.

Why: the tools are the agent's whole world. Getting their contracts right is
iterative and cheap with fakes, and expensive with a live tenant. The fakes also
become the eval fixtures, so you write them once.

The tool ticket's acceptance criteria: every tool returns a value on failure
(`isError: true`), never throws. This is not style — a throw kills the whole run,
and losing a 40-turn run because a URL 404'd is a product-visible bug.

## Slicing the rest

After the tracer, each ticket should be one **behaviour the user would recognise**,
not one layer. Good: "Feishu @-mention produces a draft recipe in the thread".
Bad: "add the Feishu adapter".

Sequence by risk, not by dependence-by-nature. The riskiest assumption in an agent
product is usually one of: does the model actually do this well enough, is the
tool surface sufficient, does the user accept the deliverable. Put the ticket that
tests the riskiest assumption second, right after the tracer. Everything else can
follow in whatever order the dependencies allow.

## What blocking edges mean here

The vendored `/to-tickets` rules apply, with two agent-specific additions:

- **Eval cases block their behaviour.** A ticket that adds a behaviour without its
  eval case is incomplete, not unblocked. Add the case to the same ticket.
- **Guardrails block the surfaces that expose them.** A guardrail must be enforced
  in the tool layer *before* a chat surface can reach it. A guardrail added after
  the bot ships is a guardrail that already failed in production once.

## Exit checklist

- [ ] The first ticket's criteria name all six loop elements
- [ ] Shared schemas are a ticket, before feature work
- [ ] Tools are a ticket, implemented against ports with fakes
- [ ] Every ticket maps to at least one eval case (or says why it has none)
- [ ] Risk order is explicit: which ticket tests the scariest assumption, and why it is not later
- [ ] Blocking edges are declared and a human has reviewed the graph
- [ ] Tickets are published per `docs/agents/issue-tracker.md`

Then: `/native-agent-dev-build`, starting from the frontier.
