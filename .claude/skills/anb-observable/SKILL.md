---
name: anb-observable
description: Stage 5. Make it possible to tell what went wrong without asking anyone — how many times it ran, what it cost, and why it failed. Use when something broke and you can't tell where, or before building more on top.
disable-model-invocation: true
argument-hint: "What do you need to be able to see?"
---

# Stage 5 — You can see what happened

**Open by asking: "how will we know this stage is finished?"**

The answer must be: *"I broke it on purpose, and then found that failure in the
record without help."*

This stage is often needed *earlier* than its position suggests. If someone cannot
tell whether the thing is working, do this before adding features — building blind
is how a small problem becomes a rewrite.

## What to produce

Three numbers, visible without running a command:

1. **How many times it ran.** Total, and in the last day.
2. **What each run cost.** For anything that calls a model, this is the number that
   quietly grows.
3. **Why the failures failed.** Grouped by reason, not a wall of text.

Three is enough. A dashboard is not the goal; being able to answer "what happened"
at 11pm is.

## The three ways this fakes success

**1. The log records only successes.** Then "it fails sometimes" is invisible, and
the count of runs is a count of good runs. Ask what the log looks like for a failed
attempt — if the answer requires writing code, failures are not being recorded.

**2. The record is silently dropped.** A record that fails a length or format check
gets written to the log file... and rejected. The program catches the error, logs a
line to the console, and continues. The user sees "success"; the history has no
entry. In the project this was extracted from, a truncation helper returned 2006
characters against a 2000-character limit, so every long record failed to store —
and the failure was an ignored exception.

**3. The cost reads as zero.** Not "cheap" — unmeasured. A column that is always
zero looks like a well-run budget. Five run records in that project all showed
zero cost, and it was not possible to tell from them whether the number was
accurate or absent.

## How to run it

1. Decide which three questions matter. If they cannot say, use the three above.
2. Record both outcomes — success and failure — in the same place, in the same
   shape. A separate error log is a log nobody reads.
3. Record the cost of every run, even when it is zero — an explicit zero and a missing value must look different in the record.

## Exit test

They cause a failure deliberately, then find it in the record.

Count check: they run it three times, and the record has three entries. Then once
more with something broken, and it has four. If the numbers disagree, records are
being lost, and that is the thing to fix before anything else.
