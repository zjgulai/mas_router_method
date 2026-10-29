---
name: anb-check-readback
description: Make the agent read its own report back item by item, out loud, so nothing hidden behind a single "passed" word. Use when a report came back that you can't parse, or when you need to know what was skipped.
disable-model-invocation: true
argument-hint: "Which report?"
---

# Check — read it back to me

The purpose: force a report to be spoken one row at a time, because summarised
reports hide things in the word "passed".

## The premise

A status line is an act of compression, and compression loses exactly what you
need. "All checks passed" can mean eleven checks passed, or three passed and eight
were skipped. Both are true statements. Only one is useful.

The person in front of you cannot audit the report themselves — that is the whole
situation. So the fix is procedural: **make the answer have to be long.**

## Run it

Ask for the report in this exact shape, and refuse a merged version:

1. How many checks exist.
2. How many ran.
3. How many passed.
4. How many failed, with the failure message for each.
5. **How many were skipped, and the reason for each.**
6. How many could not be judged, and why.

Item 5 is the one that gets omitted. Insist on it, even when the answer is "none" —
especially when the answer is "none", because that is either good news or a sign
that the concept does not exist.

If the reply comes back as one sentence, ask again with the numbered list. Do not
accept a summary of a summary.

## What the answers mean

**"Zero skipped."** Either every check is implemented, or there is no skip
mechanism. Ask directly: *"is there a way for a check to end up skipped?"* If the
answer is no, then "zero skipped" carries no information, and every future report
will also say zero.

**Skipped checks with reasons like "not implemented yet".** The verdict must be
"incomplete", not "passed". If the summary still says passed, that is finding
number one.

**No failures, ever.** Ask when the last failure was. See `anb-check-break`.

## Report back in this shape

Copy the six numbers verbatim. Then one line: *"The overall verdict as reported was
`<X>`; given `<n>` skipped and `<m>` not judged, the honest verdict is `<Y>`."*

That last line is the entire point of the check.

## When to use it

- After any "all passed" that you did not watch happen.
- Before the ship stage, always.
- Whenever a number feels too good — a cost of zero, a hundred percent pass rate,
  no failures this week.
