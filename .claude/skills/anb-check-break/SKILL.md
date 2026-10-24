---
name: anb-check-break
description: Break the product on purpose and confirm a check catches it. Use whenever a check passed and you don't believe it, before calling stage 3 finished, or any time "all green" feels wrong.
disable-model-invocation: true
argument-hint: "Which check passed that you don't believe?"
---

# Check — break it on purpose

The purpose: find out whether a check is real, without reading code.

## The premise

A check that has never failed is not evidence. It is either not running, not wired
in, or written so loosely it cannot fail. All three look exactly like success.

So the only way to establish that a check works is to make the thing it guards
break, and watch.

## Run it

1. **Pick one check.** Not all of them. One, ideally the one whose passing you find
   most surprising.
2. **Ask what would violate it**, in one sentence. If you cannot say, that is the
   finding: the check is decoration. Stop here and report that.
3. **Make the product violate it.** Concretely: produce the thing that should be
   rejected, output a value outside the range, use a forbidden word. Do it through
   the real path, not by calling the check directly.
4. **Run the check.** It must fail, and the failure message must name what it
   caught.

If it passes in step 4, you have found a defect in the check, not in the product.
That is a real result and worth reporting as one.

## What counts as a failure of this check

- The check passes. → Not wired in, or too loose.
- The check reports "skipped". → Not implemented.
- The check reports "could not be judged". → Correct behaviour when the run died,
  but if the run did not die, the check is confused.
- The only way to make it fail is to delete an expectation. → It was never testing
  the product.

## Report back in this shape

> Check: `<name>`. What violates it: `<one sentence>`. What I did: `<action>`.
> Result: `<passed | failed | skipped>` with the message it produced.

Do not summarise a pass as "it seems to work". If it passed when it should have
failed, say that plainly — that is the most useful sentence you will produce all
day.

## Where this belongs in the flow

Mandatory before stage 3 can be called finished. Recommended any time the person
expresses doubt, because their doubt is usually correct and this check either
confirms it or removes it.
