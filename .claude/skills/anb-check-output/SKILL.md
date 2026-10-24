---
name: anb-check-output
description: Look at three real outputs and judge whether they're usable, not just whether the program survived. Use when the checks all pass but you're not sure the result is any good.
disable-model-invocation: true
argument-hint: "What should I look at?"
---

# Check — show me three real outputs

The purpose: separate two questions that every automated report merges.

> **Does the mechanism work?** and **is the output any good?**

A product can pass every check and produce useless results, forever, and nothing in
the report will say so.

## Why this is a separate check

The six known failure modes in `failure-atlas` are all about the *first* question:
checks that lie about whether the machinery is trustworthy. This check is about the
second, and it has no automated substitute — because "good" here depends on what the
output is for.

The concrete case that produced this check: a small tool with thirty-one passing
tests, full error handling, complete logging. Pointed at three real websites, all
three summaries were unusable — one opened with a navigation menu and a list of two
hundred languages. Every check was about the machinery. None was about the result.

## Run it

1. **Get three outputs.** Not the examples it chose. Inputs **you** pick, and at
   least one that is messy in the way real inputs are messy — the long page, the
   odd file, the badly formatted request.
2. **Read all three in full.** Not the first one; three. The first is the one that
   was tested against, and it is often the only one that is special-cased.
3. **Ask, for each: would I hand this to someone?** If not, say which line is the
   problem. A specific line, not "not great".
4. **Ask: is there any check about whether the result is right?** Or are all of them
   about whether the program finished? If all of them are about finishing, that is
   the finding — and it is the most common one.

## The four questions, verbatim

Use these. They are phrased to force a concrete answer:

- **"Show me the output for three inputs I chose."** Not a description of the
  output. The output.
- **"Would you hand this to a client? If not, which part fails first?"**
- **"Is any check about the result being good, or are they all about it not
  crashing?"**
- **"What happens with the most common input in the world for this?"** Not the
  hardest case — the most frequent one, which is usually the messiest.

## What a passing answer looks like

Three outputs, each of which the person would show to someone, and at least one
check that is about the content of the result rather than its existence.

If there is no content check, propose one before proposing anything else. For
example: "the summary must not contain more than ten words that also appear in a
navigation list" is crude and countable and would have caught the case above.

## Report back in this shape

> Inputs I chose: `<three>`. Output 1: `<verdict, and the first failing part>`.
> Output 2: `<...>`. Output 3: `<...>`. Checks about the result: `<n>`.
> Recommendation: `<one action>`.

## The honest limit

This check can find that the output is bad. It cannot tell you what good output
looks like — that is stage 3, and it depends on knowing what the product is for. If
stage 3 produced only machinery checks, this check will keep failing and the real
fix is back there.
