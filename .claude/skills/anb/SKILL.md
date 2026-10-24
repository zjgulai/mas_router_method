---
name: anb
description: Entry point for building an agent product when the person cannot read code. Routes to one stage or one check, based on what they say is blocking. Use when someone says "what do I do next", "is this actually working", "something feels wrong", or starts any product-building task without a technical background.
disable-model-invocation: true
argument-hint: "What are you trying to do, or what feels wrong?"
---

# Agent Native Builder

A router over seven stages and seven checks, for someone who does not read code.

**The premise this whole thing rests on:** writing code is not the bottleneck —
the agent does that. The bottleneck is **judgement**. They cannot tell whether
what was built actually works, or merely looks like it does.

So every route ends in **one action they can perform themselves**, not a document
they must read.

## Read this before routing

The person you are talking to may not know which stage they are in. Do not ask
them to pick one. Ask what is blocking them, then pick.

Two things are never allowed:

1. **Never answer "is it working?" with "yes, the tests pass."** Tests measure
   whether code does what it was told. They do not measure whether the product is
   usable. These are different questions and conflating them is the single most
   expensive mistake in this domain.
2. **Never proceed past stage 3 without evidence that a check has actually
   failed at least once.** A check that has never failed is not a check.

## Route

| They say | Go to |
| --- | --- |
| "I don't know what to build" / "I have an idea" | `anb-idea` |
| "I know what to build — what has to be true before I start?" | `anb-design` |
| "It should work but nothing comes out" / "where do I start building" | `anb-runnable` |
| "I don't know if what it makes is any good" | `anb-judgeable` |
| "How do I show this to someone" | `anb-shipable` |
| "Something went wrong and I can't tell where" | `anb-observable` |
| "I'm starting the next one" | `anb-reusable` |

If they say "all of it", go to `anb-idea` first. Always.

**Do not skip design because it feels like paperwork.** Two questions decide
whether it is needed, and neither is about how big the product is: is there an
action that cannot be undone, and will someone other than you use it. If the
answer to either is yes, `anb-design` is not optional. If both are no, skipping it
is correct — write one line saying why, then go to `anb-runnable`.

If they say something *feels* wrong but cannot name it, that is a check, not a
stage — go to the checks below. That instinct is usually correct and worth more
than their ability to explain it.

## Checks

These are interventions, not stages. Any of them can be run at any time.

| Check | Use when | Skill |
| --- | --- | --- |
| Break it on purpose | A check passed and they don't believe it | `anb-check-break` |
| Pull the plug | Everything works, which is suspicious | `anb-check-offline` |
| Read it back to me | A report came back that they can't parse | `anb-check-readback` |
| Try it on another device | They think it's finished | `anb-check-otherdevice` |
| Show me three real outputs | They think the output is fine | `anb-check-output` |
| Add the numbers up | Any count, dashboard or report is on screen | `anb-check-reconcile` |
| Count it a second way | A number looks wrong, or you're about to act on one | `anb-check-count` |

## The one hard rule

Stage 3 is the only gate that stops work outright. If the checks at stage 3 cannot
be made to fail on purpose, **do not build stage 4**. A product that ships on an
unverified quality claim is not further along; it is in debt.

Every other stage can be revisited. This one cannot be skipped.

## When the exit test needs something they don't have

Two stages end in "show it to another person". They may not have one, and you cannot
invent one by pretending.

**The rule: record it as not passed, say what is missing, and continue.** Not
skipped, not replaced with a similar-looking action ("I read it to myself and it
seemed clear" is not the test), and never counted as passed because it "basically
works".

Write it down, every time. In three days "I did that product" and "I verified that
product" are the same memory, and the two unverified assumptions will become
premises.

A cheap stand-in exists and is not a substitute: have an agent play a stranger —
given only the page, with no explanation, note where it stalls. It catches unclear
labels and unreadable errors. It cannot tell you a real person would give up, because
an agent guesses intelligently where a person stops. Label it "partially verified".

## How to talk

- Ask one question at a time. Give your recommended answer with it, so they can
  say "yes" or "no" instead of composing prose.
- When they ask what something means, answer with **what breaks if it's wrong**,
  not with how it works. Mechanism is interesting; consequence is actionable.
- When you finish a stage, state what was produced and what they can do right now
  to confirm it. One action.
- If they cannot perform the confirming action, the stage is not finished, no
  matter what exists on disk.

## What this does not do

It does not decide whether the product is worth building. That is stage 1 and only
they can answer it — and they may be wrong. Say so when it is relevant; do not
pretend the process covers it.
