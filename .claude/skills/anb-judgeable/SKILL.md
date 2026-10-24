---
name: anb-judgeable
description: The verify stage (验收). Define what "good" means and make it testable, then prove the tests can fail. This is the only hard gate in the whole method. Use when the output exists but nobody can say whether it is acceptable, or before shipping anything.
disable-model-invocation: true
argument-hint: "What does a good result look like?"
---

# It can be judged

**This is the only stage that stops work outright.** Everything else can be
revisited. This one cannot be skipped, and if it cannot be completed, the honest
move is to go back to the need stage rather than forward to the ship stage.

**Open by asking: "how will we know this stage is finished?"**

The answer must be: *"I deliberately broke it, and the check told me."* Not "the
checks pass". Not "I wrote the checks".

## What this stage produces

Five to ten statements about what good and bad look like, each converted into a
check that runs without a person.

Two kinds, and you need both:

- **Countable.** Duration in a range, a required field present, no forbidden word
  used, the number of items within bounds. Cheap, stable, and where a regression
  gets caught.
- **Judgemental.** Whether the output sounds like the brand, whether a person could
  act on it. Needs a reader — a person, or a model acting as one. Expensive and
  noisier, so reserve it for what genuinely needs taste.

Countable first. Judgemental only where a countable check would be a lie.

## The five ways this stage fakes success

All four were observed in one project, all four produce a green report.

**1. A crash counts as a pass.** The check for "this must be refused" was written
as "no output was produced and the run did not succeed". A provider outage
satisfies both conditions. Three of four safety checks reported green against a
simulated 502.

*Prevention:* a check has three outcomes, not two — passed, failed, and
**could-not-be-judged**. The third is never a pass.

**2. Unimplemented checks are recorded as "skipped", and skipped counts as passed.**
The judgemental half was never built. Every run marked it skipped. The overall
verdict was "no failures, passed".

*Prevention:* a skipped check occupies a row in the report and makes the overall
verdict "incomplete". If the number of skipped checks is not printed, it is being
hidden.

**3. The check exists but was never wired into the verdict.** Implemented, unit
tested, referenced by nothing. Two of fifteen rules were in this state — and they
were the two about legal disclaimers and auditability, the two that mattered most.

*Prevention:* for each check, name the case that uses it. A check with no case is
deleted or wired, not left.

**4. The pass bar can never fail.** "At least 8 of 10 must score above 0.7" — where
the score was never computed, so the condition was vacuously true.

*Prevention:* for every threshold, ask what result would violate it. If you cannot
construct one, the threshold is decoration.

**5. The measurement changes the measurement.** Not a false signal — a signal that
is *moved by being read*. In one product, opening the dashboard added a request to
the request counter, so every look at the numbers increased them, always upward.
The same project also had pages that incremented the total and exited without
recording an outcome, so the total was larger than the sum of its parts.

*Prevention:* add the numbers up. Successes plus every named failure must equal the
total, exactly. Then load the page five times doing nothing and check that no
counter moves. Run `anb-check-reconcile`; it takes two minutes and needs nothing
but a calculator.

## How to run it

1. Ask them what good looks like, in their own words. Take the first three things
   they say — those are the real criteria; the rest will be invented to fill the
   page.
2. Convert each into a check. Where you cannot, say so and mark it judgemental
   rather than pretending a countable proxy exists.
3. **Write the check before fixing the product.** If the product is fixed first,
   the check ends up describing what the product already does — which is the
   definition of a test that cannot fail.
4. Run `anb-check-break` before declaring the stage done.
5. If any check reports counts, run `anb-check-reconcile` as well — a check whose
   accounting does not add up cannot be trusted even when it says "passed".

## The thing that goes wrong here

**They will want to skip to the ship stage.** The product runs, it looks fine, and this
stage produces no visible artifact — just checks.

Say what it buys, concretely: without it, every later change is unmeasurable, and
"is this better than last week" becomes an opinion. That is the stage where products
quietly get worse for months while everyone believes they are improving.

## Exit test

A check that was green is now red, because someone deliberately broke the product.
They saw it go red. They can name which check caught it.

If no check has ever failed, this stage is not done — regardless of how many pass.
