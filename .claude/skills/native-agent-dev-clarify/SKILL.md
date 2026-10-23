---
name: native-agent-dev-clarify
description: Stage 1 of the agent-product flow. Turn a vague agent idea into a stated job, named failure modes, and a decision about whether an agent is even the right shape. Use when requirements are unclear, when someone says "we should build an agent that...", or before any spec is written.
disable-model-invocation: true
---

# Stage 1 — Clarify

Exit test: **the job is stated in the user's words, every failure mode is named,
and a human has agreed the agent is the right shape for this problem.**

Two of those three are the usual suspects. The third — "is this even an agent" —
is the one that saves the most money, so it goes first.

## Step 1: Decide whether this should be an agent

An agent earns its cost only when all four are true:

1. **The path varies.** Different inputs need different sequences of steps. If every
   request follows the same fixed pipeline, that is a workflow, and a workflow
   should be code — cheaper, faster, testable.
2. **The steps are discoverable at runtime.** The system cannot enumerate them in
   advance. If it can, write the enumeration.
3. **A tool surface exists.** The agent acts through tools you own. A chat box with
   no tools is a prompt, and prompts belong in a single API call.
4. **Errors are recoverable.** A wrong tool call can be detected and retried. If a
   single mistake is unrecoverable, you want a form with validation, not an agent.

If fewer than four hold, say so plainly and propose the non-agent design. This is
not a formality — the most common product failure in this space is an agent where
a form would have been better, shipped because agents are interesting.

For this repo's product specifically: the TikTok recipe workflow clears all four.
The reference is unstructured, the analysis path depends on what the video
contains, the tools are ours (analyse, save, draft), and a bad draft is caught by
review before it ships. If you cannot restate that argument for the work in front
of you, stop and ask.

## Step 2: Get the job in the user's words

Interview them — use the vendored `/grilling` primitive via `/grill-with-docs` if
they want the full treatment. What you need out of it, at minimum:

- **Who** does this today, and what do they actually do instead? "Nobody does this"
  is usually wrong; someone does it in a spreadsheet or by hand, and *that* is your
  competitor.
- **What does done look like to them**, in their vocabulary, not ours.
- **What would make them stop using it** in week two. This question surfaces the
  real quality bar far better than "what features do you want".
- **What must never happen.** For brand content: an unsubstantiated health claim,
  a competitor's asset, a rights violation. These become guardrails, and they are
  cheaper to collect now than to discover in a review queue later.

Write the result to `docs/product/<feature>-brief.md`. Keep it under a page —
if it needs more, the job is not clear yet.

## Step 3: Name the failure modes

Every agent product fails in a handful of characteristic ways. Name which ones
apply *before* design, because each one becomes a specific test in stage 2.

| Failure mode | What it looks like | Where it gets caught |
|---|---|---|
| **Wrong shape** | It answers a question nobody asked | Clarify (here) — cheap to fix |
| **Silent drift** | Output is plausible but off-brand or off-brief | Eval case with a rubric |
| **Tool misuse** | Calls the right tool with wrong arguments | Tool contract + eval case |
| **Confident wrongness** | Asserts a claim it cannot support | Guardrail + eval case |
| **Cost blowout** | One user runs a $40 tab | Runtime budget, not a prompt |
| **Unexplainable run** | "It gave me something weird yesterday" | Run steps, persisted |
| **Context rot** | Quality degrades over a long conversation | Session design |

For each applicable row, write one sentence: *how we would notice*. A failure
mode with no detection story is not a failure mode, it is a wish.

## Step 4: Confirm the artefact the product delivers

Agents are judged by what they hand back, not by their transcript. Decide the
deliverable shape now — for this repo it is a **Recipe**: a structured object a
human reviews and a shooter acts on. If the deliverable is "a chat response", say
that out loud, because it is a much weaker product and it changes the eval design
significantly.

## Exit checklist

- [ ] The four agent-shape criteria are argued, not assumed
- [ ] The job is written in the user's vocabulary, under one page
- [ ] "What would make them stop using it" has a concrete answer
- [ ] "What must never happen" is a list, not a vibe
- [ ] Each applicable failure mode has a detection story
- [ ] The deliverable's shape is named
- [ ] `docs/product/<feature>-brief.md` exists and a human has read it

Then: `/native-agent-dev-spec`.
