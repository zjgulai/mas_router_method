---
name: anb-runnable
description: The build stage (开发). Build the narrowest path that takes one real input and produces one real result, with no fake data anywhere. Use when starting to build, when nothing comes out, or when the thing only works on prepared samples.
disable-model-invocation: true
argument-hint: "What should go in, and what should come out?"
---

# It runs

**Open by asking: "how will we know this stage is finished?"**

The answer must be: *"I give it an input I chose myself, and I get a result I'd show
to someone."* Not "the code is written". Not "the page loads".

## What to build

One path. Narrow. Ugly.

One real input in, one real result out. No sample data. No placeholder. No "we'll
wire the real thing later". It must run a second time and give the same kind of
result — a one-shot demo is not a path.

Deliberately excluded at this stage: login, multiple users, settings, a nice
interface, error messages for cases you haven't hit. Each of them is a way to spend
a week without learning whether the idea works.

## Read the constraints first

```bash
node scripts/design.mjs constraints
```

Two things to respect while building, both easy to break by accident:

**Judgement points stay judgement.** If the design counts three places that need a
decision at runtime, do not hard-code the common case into a special branch. That is
exactly the "works for one case" failure this stage exists to prevent, wearing the
design's authority.

**Action permissions are implementation boundaries.** Anything the design puts in the
ask-a-human tier must not be reachable without that gate. The build stage is where a
missing gate becomes invisible: nothing errors, the action simply happens.

Exit code 3 means no confirmed design. Carry on, but say so once.

## The failure this stage exists to prevent

**The demo that was never connected to anything.**

The thing will have an interface, buttons that respond, and output that looks
plausible — while the data behind it is fixed. This is not deception; it is what
happens when you build the visible half first because it is more satisfying.

The symptom is specific: **every test passes, and the first real run fails.** In the
project this method was extracted from, thirty-one unit tests were green and the
very first real analysis could not run at all, because the test fixture returned an
empty list from the one lookup that path depended on.

So at this stage, "it runs" means it ran **with input you chose**, on the **real
dependencies**, producing output **you looked at**.

## How to run it

1. Ask them for the input. One concrete example: a link, a file, a sentence they
   would actually type. Do not accept "some text".
2. Build for that input only. When you have to choose between handling a second
   case and getting the first case through, always choose the first.
3. When it runs, show them the result **and** how to run it themselves.

Do not summarise the result for them. Print it, in full, so they see what came out
rather than your description of it.

## The thing that goes wrong here

**You will reach for a framework.** "This will be easier to extend if I set up..."

No. Extending is a later problem, and a foundation built before you know the shape
of the thing is the most expensive kind of rework — it is designed to accommodate
guesses, and it will need to be torn out when the guesses are wrong.

Build the smallest thing that produces a real result. If it is one file, one file.

## What you record

Work that spans more than this conversation gets a ticket:
`work/tickets/open/T-NNN-slug.md`, saying what to do and how you will know it is
done.

Work that finishes and is verified inside one conversation does not. Opening a
ticket for it is how the register becomes a diary.

## Exit test

They run it themselves, with an input they chose, and get a result.

Then they do it a second time with an input **they did not plan for** — something
they thought of on the spot. If the second one fails, the path works for one case,
which is not the same as running.

Report honestly which of the two happened. Do not round "worked once" up to "works".
