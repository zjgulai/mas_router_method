---
name: anb-idea
description: The need stage (需求). Turn "I want to build X" into one sentence that says who uses it, when, and what they can do afterwards that they could not before. Use when the idea is vague, when it is described as a feature list, or before any building starts.
disable-model-invocation: true
argument-hint: "What do you want to build?"
---

# The idea

**Open by asking: "how will we know this stage is finished?"**

Do not accept "when I've thought it through" or "when it's clear". The answer must
be an action they can perform: *"I'll read it to someone who doesn't work in tech
and they'll be able to tell me what it's for."*

If they cannot give an answer, that is the stage-1 work. Say so plainly, then help
them find one.

## The sixth sentence: does this need an agent at all?

Ask it here, in the need stage, because it is a decision about what you are building —
and because getting it wrong is the most expensive mistake available.

**One test: can you draw the decision tree?** If you can write the order of steps
and where it branches, it is a workflow and it should be built as one — fixed
sequence, one model call inside it, cheaper, faster, and far easier to check.

An agent is worth its cost when the number of possible next steps is unknown at
design time: when the right move depends on what came back last time, and you
cannot enumerate the branches in advance.

Write the answer as one line and keep it. At the design stage the flow gets re-counted, and
if the count comes back with no judgement points, this line is what tells you to
go back rather than build.

Do not accept "agents are the modern way" or "an agent sounds more capable". A
pipeline that answers correctly beats an agent that improvises and sometimes does.

## What this stage produces

One page, five sentences, each one line:

1. **Who** uses it — a person, not a market segment.
2. **When** they use it — the situation, not the frequency.
3. **Why now** — what they do instead today, and why that is worse.
4. **What they can do afterwards** that they could not before.
5. **What would tell you not to build this** — the disconfirming evidence.

The fifth is the one that saves money, and the one they will want to skip.

Then **two** more lines. They are answers rather than sentences, and both get left out.

**Does this need an agent at all** — `pipeline` or `agent`. One word is enough here;
the design stage redraws it properly.

**What it hands back.** The artifact, not the capability. Sentence four says what they
can *do* afterwards; this says what they *receive*. The difference is not academic:
in the first real run, an agent given only the five sentences read back the purpose and
the user correctly — the exit test passed on its own terms — and then said it had no
idea what it would get.

Write it as a noun a person could hold: "a draft reply with each sentence annotated by
the policy it rests on", not "better answers".

## How to run it

Ask one question at a time. For each, state your recommended answer first, so they
can agree or correct rather than compose from scratch:

> "I'd guess the person is a brand manager who gets a viral video forwarded in a
> group chat. Is that right, or is it someone else?"

**Sentence three is two questions, so ask it twice.** "What do you do instead today"
and "why is that worse" look like one line and are not. Asked together they collect
half an answer — the workaround, and no reason — which leaves the product with no case
for existing. Ask for the workaround; then ask for **one specific time it went wrong**,
from the last month. "It's slow" is true of everything and settles nothing.

When an answer is a feature ("it should have login", "it needs to export"), do not
accept it — ask what the person is trying to do that login or export would let them
do. Features are how people describe solutions when they have not yet said the
problem.

When an answer is a category ("an AI tool for content"), same move: ask who,
specifically, and on what day.

## The thing that goes wrong here

**You will be tempted to write this page for them.** You know what a good one looks
like, and filling in the blanks takes thirty seconds.

Do not. Every line you write is your guess about their intent, and they will
approve it because it reads well. Then at the verify stage they will have no standard to
judge against, because the standard came from you and they cannot tell whether it
is the right one.

Your job here is to **ask**, not to answer. If they say "you decide", give two
concrete options and make them pick. Do not pick for them.

**And there is a second version of the same trap, which is harder to see.** These
instructions *also* tell you to offer your recommended answer, so they can agree rather
than compose from scratch. That is right, and it is exactly how you end up writing the
page for them anyway: if they agree with every question, you cannot tell whether they
meant it or simply had nothing to object to.

Agreement on everything is a signal, not a success. When it happens, stop and ask for
one concrete fact only they can supply — the last time it went wrong, who the person is,
what the number was.

> A recommended answer that survives contact with a specific instance was theirs all
> along. One that does not was yours.

## What you record

The five sentences are a conversation until they are written down. A requirement
goes in `work/requirements/drafting/R-NNN-slug.md`: the one sentence, and what
would make it wrong.

Only when it will outlive this conversation. Something you decide and build today
does not need a file — a register full of those is a diary, and diaries are not
read.

## Exit test

They read the page to someone who does not work in tech, and that person can say back
three things: what it is for, who it is for, **and what it hands back to them.**

The third was added after the first real run. The stranger read back the first two
correctly and then said it had no idea what it would get. A test can do exactly what it
claims and still be asking about the wrong thing.

If it needs explaining, it is not done. Rewrite it shorter, not clearer — the
problem is almost always that it is describing two things.
