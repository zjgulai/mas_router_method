---
name: anb-reusable
description: The iterate stage (迭代). Take only the parts you actually used more than once and make them the starting point for the next product. Use when starting a second similar product, or when deciding what to keep.
disable-model-invocation: true
argument-hint: "What are you starting next?"
---

# The next one starts ahead

**Open by asking: "how will we know this stage is finished?"**

The answer must be: *"The second product reaches a real result faster than the
first one did."* Not "I made a template". A template that does not make the second
one faster is a cost, not an asset.

## What to change

Before deciding what to keep, decide what to change. This is the half of the stage
that closes the loop, and the half that gets skipped — carrying reusable parts
forward is satisfying, while acting on what the numbers actually said is not.

Start from the three numbers the operate stage produces: how many times it ran, what
it cost, and why the failures failed. Each implies a different kind of change, and
two of them are commonly misread:

- **It barely ran.** Not a product defect — a reach problem. No amount of building
  fixes it. Say so rather than adding features.
- **It ran and cost more than it was worth.** The fix is usually a narrower path, not
  a cheaper model.
- **It failed for one reason, repeatedly.** That reason is the next piece of work,
  and it is the only one of the three with an obvious answer.

Each decision goes back into a register, not into a summary: a requirement in
`work/requirements/` if the need itself moved, a ticket in `work/tickets/` if it is
work you are now committing to. That is what closes the loop. Without it the
observation stays in this conversation and the next round starts from memory, which
is how a project relearns the same thing every few months.

## What to keep

Only what passed all three:

1. You used it in **this** product, not in a previous one.
2. You used it **more than once**, not once with a plan to reuse.
3. It has a **check that has failed at least once** (the verify stage's rule).

Everything else is deleted. Not archived — deleted. An archive is where good
intentions go to become maintenance.

## What is usually worth keeping

- The loop that calls the model and records what happened.
- The four known-failure guards: the three-outcome check, the shared limit, the
  failure log, the isolation between two users.
- The check runner, with two example checks.
- One working example that runs.

That is roughly a day of work. It is worth a day because those four guards are the
ones nobody remembers to write.

## What is usually not worth keeping

- Multiple users, roles, permissions. You had one user. You do not know the shape of
  the problem yet.
- Multiple platforms or providers. The abstractions that make them interchangeable
  cost more than rewriting, at this size.
- A plugin system, a config file with twenty options, an interface with three
  implementations and one use.

All three are appealing because they feel like engineering. They are what slows the
second product down.

## The failure this stage exists to prevent

**The foundation built for imagined requirements.**

An agent is very good at producing a flexible, configurable, general base — and that
base becomes the heaviest thing in the next project, because every future decision
has to fit inside it.

The test is blunt: **was this used in the last product?** If not, it is a
generalisation of one case, which is a guess dressed as architecture.

## How to run it

1. List what is in the current product.
2. For each item, answer the three questions above. Most fail on (2).
3. Delete the failures. Then re-run the current product's checks to prove nothing
   broke.
4. Start the second product from what remains, and time how long until its first
   real result.

## What you record

What you decide to change goes back into the registers, not into a summary. A
requirement in `work/requirements/` if the need itself moved; a ticket in
`work/tickets/` if it is work you are now committing to.

That is what closes the loop. Without it the observation stays in this
conversation, and the next round starts from memory — which is how a project
relearns the same thing every few months.

## Exit test

Second product, first real result, faster than the first one.

If it is slower, the template is carrying weight it should not. Cut it down and
try again — do not add more to "make it more useful", which is how a template
becomes a framework.
