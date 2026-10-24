---
name: anb-shipable
description: The ship stage (交付). Get it to a place where someone else can open it and use it without you sitting next to them. Use when the thing works on your machine and you want to show it to someone, or before calling anything finished.
disable-model-invocation: true
argument-hint: "Who needs to use it, and on what?"
---

# Someone else can use it

**Open by asking: "how will we know this stage is finished?"**

The answer must be: *"I opened it on my phone and a person who is not me used it."*
Not "it's deployed". Not "the link works for me".

This stage exists for one reason, and it is not "going live": **it is the first time
you see the product from the position of a user.** Everything before this, you were
looking at it from the inside, where all the pieces are already in place.

## What to do

Get it to an address that opens for someone who does not have your laptop.

That is the whole requirement. Not a domain, not a certificate, not monitoring. A
link that opens elsewhere.

## The failure this stage exists to prevent

**"Works locally" reported as "ready".**

Four things are always configured on the machine where the thing was built, and
always missing everywhere else:

- the credentials (an API key in a local file)
- the data (a database that exists only there)
- the permissions (a login that only accepts one account)
- the address (a server that only listens on localhost)

None of them produce an error during development, because none of them are used
during development in their unconfigured form. They fail the moment a stranger
tries.

There is a second form worth naming: **a link that only works on their machine.** A
development address often still "opens" for its owner, so it is easy to believe it
is public. The test is not whether it opens for you.

## How to run it

1. Put it somewhere reachable.
2. List every secret and every piece of data it needs, and check each one comes
   from the environment rather than from a file on the build machine.
3. Open the address **on a device that is not the build machine** — a phone is
   best, because it is genuinely a different environment and the failures show up
   immediately.
4. Have one other person try it, and watch. Do not help them for the first minute.

Step 4 is where the information is. Whatever they get stuck on is the entire
roadmap for the next stretch of work, and it will not be what you expected.

## The thing that goes wrong here

**Filling the wait with features.** The ship stage often has dead time — a deploy, a
domain, a permission. The temptation is to add something while waiting.

Don't. Two reasons. First, unreleased features are unmeasured, and you now have a
quality bar at the verify stage that you would have to extend to cover them. Second, the
feedback from step 4 will invalidate some of what you would have built.

## What you record

Who received it, and how they confirmed, goes in `work/receipts/REC-NNN-slug.md`.
Append-only, like evidence.

This is the only register that records something outside the repository: a person
opened it and said so. Write it the same day. In a week you will not remember
whether they used it or you showed it to them.

## Exit test

They open it on a different device. It loads. One other person uses it without
instruction.

If the other person needed instruction, the gap between you and them is the product
work — not a documentation task. Write it down as a defect, not as a note.
