---
name: anb-check-reconcile
description: Add up the numbers and see whether the parts equal the whole. Use whenever a dashboard, count, or report is presented, and before trusting any total.
disable-model-invocation: true
argument-hint: "Which total should I check?"
---

# Check — add it up

The purpose: find a record that opened and never closed, using arithmetic.

## The premise

Every count is a claim that the parts sum to the whole. Most of the time nobody
checks, because each number looks reasonable on its own.

The failure is specific and common: **a request (or order, or job) increments the
total, then exits down a path that never records an outcome.** The total grows, the
categories do not, and the gap is invisible unless someone subtracts.

There is a second, nastier flavour: **the act of observing is itself counted.**
Looking at the dashboard adds a request. Then the numbers drift every time anyone
looks, and always upward — so the more carefully you watch, the more activity you
seem to have.

## Run it

1. **Get the total.**
2. **Get every category that is supposed to make it up.** Successes, and each
   named failure reason separately.
3. **Add them.** Do it on paper or in a calculator, not in your head.
4. **Compare.** They must be equal, exactly.

If they differ, the difference is a count of events that were started and never
classified. That is a defect in the record, not a rounding error.

Then, for the observation problem:

5. **Do nothing, and refresh the view five times.** Watch one number. If it moves,
   your observation is being counted.

## What the answers mean

**Equal.** The record closes on every path. Keep this check: it will catch the next
path someone adds and forgets to close.

**Off by one or two, consistently.** Usually static assets or health checks. Fix by
excluding them, not by explaining them.

**Off by a growing amount.** A path is being added faster than it is closed. Find
it before trusting anything else on that page — every other number is derived from
the same machinery.

**Moves when you refresh.** Observation is counted. Whatever else the dashboard
says, its traffic figure is inflated by the number of people looking at it.

## Report back in this shape

> Total: `<n>`. Parts: `<a> + <b> + <c> = <sum>`. Equal: `<yes/no, by how much>`.
> Refresh test: `<moved / did not move>`.

## Why this is worth doing first

It is the only check in this method that can be done with nothing but a calculator.
No second device, no broken credentials, no test fixture. Two minutes.

And it validates the foundation the other checks stand on: if the record has holes,
every conclusion drawn from it is unsupported — including the conclusions of the
checks that are working correctly.
