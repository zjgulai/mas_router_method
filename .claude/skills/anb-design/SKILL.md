---
name: anb-design
description: The design stage (设计). Decide the four things that are expensive to change later — the shape of the flow, what it must refuse, what it may do without asking, and what the model sees when it acts. Use after the idea is confirmed and before anything is built, especially when the product can send, pay, delete or publish.
disable-model-invocation: true
argument-hint: "What does it have to get right that you cannot fix later?"
---

# Design

**Open by asking: "how will we know this stage is finished?"**

The answer must be an action: *"I handed the four answers to an agent and it
built the narrow path without asking me anything."* Not "the design is clear".
Not "I wrote it down".

Every question the implementer has to ask is a hole in the design. Counting the
questions is the only measurement this stage has. Take it.

## This stage is four conversations, not four documents

One question per turn. State your recommended answer first, so they can agree or
correct instead of composing prose. Each answer becomes **one block in one file**.
If the whole thing takes more than twenty minutes, it is being over-built.

Ask by trigger, not by product size. "It's small" is not a reason to skip
anything — a small tool that sends one email has the same irreversible action as
a large one.

| Question | Ask it when | Skip it and say so when |
| --- | --- | --- |
| 1. What is the shape of the flow? | Always | Never |
| 2. What must it refuse? | Always | Never |
| 3. What may it do without asking? | It can send, write, delete, pay, or publish | It only reads and shows |
| 4. What does the model see when it acts? | The model chooses at runtime which tool to call | The flow is fixed and calls one thing |

Two never-skipped, two by trigger. Write the skipped ones down with the reason —
in three months "I skipped it" and "I never considered it" are the same memory.

## Question 1 — the shape of the flow

Not an architecture diagram. A numbered list with one split in it: which steps are
**fixed, same every time**, and which steps need **judgement at runtime**.

The count of judgement points is the number to watch. Zero or one: this is a
pipeline and it will be cheap, fast and easy to check. Three or more: either the
product genuinely needs to improvise, or the thinking is not finished and the
model is being asked to do it for you.

Retype, summarise, extract, format, route by a rule — all fixed. Decide which of
five sources is authoritative, judge whether a claim is substantiated, choose
which of three tactics fits this customer — these are judgement. If they cannot
tell which side a step is on, it is judgement wearing a fixed step's clothes, and
it will behave differently every run.

That count is also the honest answer to "should this be an agent at all". A flow
with no judgement points does not need a model choosing its own steps; it needs a
script with one model call inside it — cheaper, faster, and far easier to check.
Say so when it is true. The need stage already asked whether a person would pay for this;
this question asks whether the model needs to be in charge of the order.

## Question 2 — what it must refuse

Two kinds of row, and both are needed:

- **Out of scope.** This product is not for that. "Someone asks it to write the
  final legal wording — it points to a person instead."
- **Would cause harm.** Doing it breaks something: a claim the brand cannot
  prove, a person's data leaving, an action with no undo.

Each row has a fixed shape: **a concrete input → what it must do instead.**

> "Asks whether the serum cures acne → must say it cannot make medical claims,
> and offer the appearance-wording alternative."

If they cannot name a concrete input, it is a value, not a refusal. "Be honest",
"don't be harmful", "stay on brand" are values. Values cannot be tested at the verify stage
and will be quietly dropped when the checks get written. Ask for the input.

The exit condition for this question: **each row can become a check.** If a row
cannot be written as "given this input, that output must not appear", it is not a
refusal yet.

This is also the one place where the design and verify stages overlap on purpose.
Design writes the list; verify turns it into checks. That is not duplication — it is the
list being born with somewhere to go.

## Question 3 — what it may do without asking

Sort by **whether it can be undone**, never by how important it feels. Importance
is a judgement they will get wrong; reversibility is a fact they can look up.

| Tier | Test | Rule |
| --- | --- | --- |
| Reversible | If it is wrong, you undo it in one step and nobody saw | Let it act |
| Costly but bounded | Undoable, but it costs money, reaches a person, or is visible for a while | Let it act, record it, cap it |
| Irreversible | Cannot be undone, or was seen by an audience | **Ask a human first** |

The middle tier is the one that gets skipped, and it is where the real damage
lives: not a wrong answer, but fifty wrong answers sent before anyone looked. Put
a number on it — how many, how much, per what period — because "reasonable use"
is not a limit.

Then the sentence that goes in the prompt, in their words: *"Anything in the third
tier stops and asks. Anything in the middle tier does it and tells me after."*

## Question 4 — what the model sees when it acts

For each thing the model can do, three lines:

1. **What it does** — one sentence, in the user's terms.
2. **When not to use it** — mandatory, even if it reads "no exception yet".
3. **What it returns when it fails** — so the model can tell "retry" from "stop".

The second line is the one everyone omits and the one that causes the misuse.
A description that only says what a tool does is permission to use it everywhere.
The most common failure in agent products is not a broken tool; it is a correct
tool used in the wrong situation, and it looks completely normal in the logs.

The third line decides whether a failure costs one step or the whole run. A tool
that fails with an unreadable error teaches the model nothing; a tool that says
"this id does not exist, do not retry with the same id" ends the loop by itself.

Frame it for them: this text is not documentation, it is the model's only view of
the world. Whatever is not written there does not exist for it.

## What this stage produces

One file, four blocks, whether or not a block is used:

```
## 一、流程形状      固定步骤 / 需要临场判断的步骤 / 判断点共几处
## 二、拒绝清单      a concrete input → what it must do instead
## 三、动作权限      每条动作标一档：可撤销 / 有额度 / 必须问人
## 四、交接契约      每个工具三行：做什么 / 什么时候别用 / 失败返回什么
```

Plus two lines that cost nothing and save a rewrite:

- **What would make this design wrong** — one observable event, not "if it
  doesn't work". A design with no re-open condition becomes untouchable in three
  months because nobody remembers what it assumed.
- **Which ADRs this produced** — a pointer, not a copy. Hard-to-reverse choices go
  to `docs/adr/`; this record just says which ones.

## Paying for the decision

Two questions separate a choice worth twenty minutes from one worth none:

- **How much does changing it later cost?** If the answer is "an afternoon", decide
  now and move on. Do not design it twice.
- **Can I tell which is better before building?** If no, pick the one that is
  easier to undo and write down what you expect to see.

For a choice that is expensive and genuinely undecidable, describe two shapes and
write, for each, the situation in which it wins. Then pick the one that is cheaper
to back out of. Never pick the more familiar one — familiarity is not evidence.

## How this stage fakes success

**The design becomes a specification.** Forty pages, every edge case, reads
impressively. Test: can you point at one sentence and say "I cannot do that"? If
every line is agreeable, it is a document, not a design.

**The refusal list becomes values.** "Honest", "harmless", "on brand". All true,
none testable. Test: name one input that would trigger each row. No input, no row.

**Permission is sorted by importance.** "Payments are important, so ask before
paying. Reading files is minor, so allow it." Now a read that dumps every customer
record is allowed and a $2 charge is blocked. Test: sort by undo, nothing else.

**The handover contract only says what the tool does.** The model then calls it in
situations it was never meant for, and every log line looks correct.

**The design freezes too early.** It was written before any code existed, so it is
a guess. That is fine — but only if the file says which assumption would break it.
Without that line, the guess becomes a constraint, and later evidence loses to it.

## The thing that goes wrong here

**They will want to skip it**, and the reason will sound reasonable: "this one is
small". The size of the product is not the test. Two facts are:

- Is there any action that cannot be undone?
- Will someone other than the author use it?

Neither: skip the whole stage, write one line saying why. Either one: it is not
small in the way that matters, and question 2 is not optional.

**Do not write this file for them.** Same trap as the need stage, higher cost: a design
you wrote reads better than one they wrote, so they will approve it, and then at
the verify stage there is no standard they can judge against — because the standard is
yours and they cannot see its edges.

Your job is to ask, and to notice when an answer is a value pretending to be a
refusal. Say so, give two concrete options, make them pick.

## What you record

The four blocks go in `work/designs/drafting/D-NNN-slug.md`. When all four are
answered, move it to `confirmed` — that is what turns it from a document into a
spec the verify stage can read.

Four sections, skips marked with a reason, and the condition that would make this
design wrong. `work check` fails a record missing any of them, and fails a
confirmed one that cannot say what would overturn it.

## Exit test

They hand the four blocks to an agent, with no other context, and ask it to
implement the narrowest path. Then count the questions it had to ask.

Zero questions: the design is done. Each question is a hole — fill it, hand it
back, count again. Two rounds is normal; more than three means a block is missing
rather than underspecified.

Then the second half, and it is the one that makes this stage worth anything:
**every row in the refusal list can be written as a check that would go red.** A
row that cannot becomes a value again, and gets deleted now rather than silently
at the verify stage.
