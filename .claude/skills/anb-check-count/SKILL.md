---
name: anb-check-count
description: Recount a number with a second, independent method before acting on it. Use whenever a count, total or "only N of them" appears in a report, and especially before changing code because a number looks wrong.
disable-model-invocation: true
argument-hint: "Which number should I recount?"
---

# Check — count it a second way

The purpose: catch a wrong count before it becomes a wrong decision.

## Why this exists

A wrong number does not look wrong. It looks like the other numbers around it. And it
usually comes from a command you trust, used slightly outside its contract.

The case this check was written from: verifying that 108 entries had rendered on a page.

```
$ grep -c '<tr id=' skills.html
7
```

Seven is plausible. Nothing about it invites doubt. The conclusion drawn was "only 7 of
108 rendered, something is broken" — one step from editing the generator to fix a problem
that did not exist.

`grep -c` counts **lines containing a match**, not matches. The table was written as one
line per section, so seven sections, seven lines, 115 tags.

```
$ grep -o '<tr id=' skills.html | wc -l
108
```

## Run it

1. **Say what you are counting.** Not "rows" — "skill entries in the table".
2. **Say what your command counts.** For `grep -c` that is lines. For `wc -l` it is
   lines. For an array's length it is elements, which is not the same as distinct values.
3. If those two sentences disagree, stop. The number is already wrong.
4. **Count again a different way.** Parse the structure. Sum the parts. Query the source
   of truth instead of the rendering.
5. **Compare.** Two independent methods agreeing is evidence. One method repeated is not.

## The shapes this takes

| You count with | It actually counts | The trap |
|---|---|---|
| `grep -c` | lines containing a match | one line, many matches |
| `wc -l` | newlines | an entry spanning several lines |
| array `.length` | elements | duplicates not removed |
| log lines | lines written | one request may write several |
| file count | files | one feature may be many files |

The common shape: **you are counting a container and believing you counted the things
inside it.**

## For a total specifically

Add the parts separately and see whether they sum. `19 + 24 + 17 + 18 + 14 + 9 + 7 = 108`
is a second derivation, not a second reading of the same command.

If the parts do not sum to the total, one of them is wrong — and the total is the one
people quote.

## Report back in this shape

> Counting: `<what>`. Method A: `<command>` = `<n>`. Method B: `<command>` = `<m>`.
> Agree: `<yes/no>`. If no, which is wrong and why.

## What not to do

Do not "fix" anything based on one number from one command. The cheapest possible
verification is a second command; the most expensive mistake is editing code to satisfy
a measurement error.
