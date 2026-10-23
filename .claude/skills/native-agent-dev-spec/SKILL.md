---
name: native-agent-dev-spec
description: Stage 2 of the agent-product flow. Turn a clarified brief into a spec whose quality bar is executable — an eval set, a scoring rule, and the tool contracts the agent may use. Use after clarify, or when someone says "write the spec" for an agent feature.
disable-model-invocation: true
---

# Stage 2 — Spec

Exit test: **an eval set exists, and a human agrees it defines "good" better than
any prose paragraph could.**

Use `/to-spec` for the prose half — problem, solution, user stories, decisions.
This skill covers what `/to-spec` does not know about agent products: the three
artifacts that a prose spec leaves out and that everything downstream depends on.

## Why a prose spec is not enough for an agent

A normal spec says what the software must do, and a test asserts that it does it.
An agent has no single correct output. "Write a good TikTok hook" cannot be
asserted the way "returns 200" can.

Two failure patterns follow, and both are common:

- **The eval-free spec.** Quality is argued in review forever, because nothing
  pins it down. Every later disagreement is an opinion.
- **The over-pinned spec.** Someone encodes one golden output, and the agent is
  graded on string similarity to it — which passes mediocre work that happens to
  match and fails excellent work that does not.

The fix is the same in both cases: define *criteria*, not outputs.

## Artifact 1 — The eval set

Write it to `docs/evals/<feature>.md` as cases; implement it in
`packages/evals/src/cases/` as code. Both, and they must agree.

A case is:

```
id            stable, never renumbered — scores are compared across runs
input         the exact request a user would make (real wording, not sanitised)
fixtures      which brand, which reference, which fake tool responses
expectations  what must be true of the output, as machine-checkable rules
should_fail   true when this case exists to test a guardrail
why           one sentence: what real-world failure this case prevents
```

Rules for writing cases:

- **Start from real requests.** Copy the wording a marketer actually typed. A
  polished input measures a handler you will never receive.
- **Ten cases, not a hundred.** Cover the common path, the two hardest real
  variants, and every guardrail. Add cases when a real failure happens, not
  preemptively — an eval set that grew from guesses is a second spec nobody reads.
- **Every guardrail gets a `should_fail` case.** A prohibited claim, a
  competitor's content, a rights violation. If the suite cannot demonstrate the
  agent refusing, you have not tested the guardrail — you have tested that the
  agent usually behaves.
- **Assertions are predicates, not phrases.** `hook duration <= 3s` and
  `no banned term appears` are assertions. `contains "you won't believe"` is a
  snapshot with extra steps.

## Artifact 2 — The scoring rule

Decide, per expectation, whether it is:

| Kind | Use for | Cost per run |
|---|---|---|
| **Deterministic** | Duration, banned terms, schema validity, claim count | Free |
| **Rubric-scored by an LLM judge** | Voice match, hook strength, transferability | One extra call |
| **Human review** | Anything legal, or judgement you do not yet trust a judge on | A person's time |

Bias hard toward deterministic. An agent product where 80% of the score comes from
an LLM judge has replaced a vague product with a vague test. The judge is for the
part that genuinely needs taste, and every judge prompt must state its rubric in
the same words the brand's `successCriteria` uses, or the two drift apart.

Write the scoring rule down, including what a *passing* score is. "70% of cases
pass" is not a bar; "every `should_fail` case passes, and 8 of 10 positive cases
score above 0.7 on the rubric" is.

## Artifact 3 — The tool contracts

List the tools the agent may call, and for each: its arguments, what it returns,
and **when the model is told to use it**. The description is not documentation —
it is the only thing the model sees, so it is part of the spec.

For each tool, answer:

- What does the model learn from a failure here? (It should learn something; an
  opaque error teaches nothing and costs a turn.)
- What happens if it is called twice? (Idempotent, or a deliberate cost.)
- Is it reversible? (Irreversible tools need a confirmation path.)

If a tool's contract is unclear, the fix belongs here — not in the prompt later.
Patching a contract problem with prompt text is the most expensive way to fix it,
because the prompt is the hardest part of the system to test.

## What to borrow from `/to-spec`

Run `/to-spec` for: problem statement, user stories, implementation decisions,
testing decisions, out of scope. Add the three artifacts above as additional
sections. Publish it to the tracker per `docs/agents/issue-tracker.md`.

Do not let `/to-spec`'s "testing decisions" section stand in for the eval set.
They answer different questions: testing decisions say how the code is verified;
the eval set says how the *output quality* is judged.

## Exit checklist

- [ ] `docs/evals/<feature>.md` names 10 or fewer cases, each with a `why`
- [ ] Every guardrail from the brief has a `should_fail` case
- [ ] Every expectation is classified deterministic / judge / human
- [ ] The pass bar is a number, written down
- [ ] Every tool the agent may call has a contract, including its failure message
- [ ] A human has read the eval set and said "yes, that is what good looks like"

That last box is the gate. If the human hesitates, the cases are not concrete
enough — go back, do not proceed.

Then: `/native-agent-dev-tickets`.
