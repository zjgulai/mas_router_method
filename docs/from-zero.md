# From zero: the order that actually works

This file exists because the original plan — `/init`, then git, then skills, then
the product — is close to right and wrong in one specific way that costs real time.
Worth reading once before the next repo starts this way.

## What was wrong with the original order

**`/init` cannot run first, and it is not the thing that matters.**

`/init` reads the repo and writes "how this place works" for the next agent. In an
empty directory there is nothing to read, so it succeeds while producing a
document about nothing. The document then becomes a habit: nobody rereads it, and
by the time the real structure exists it describes a repository that never
existed. Its output, not its timing, is what matters.

**git before files, not after.**

Almost right in the plan, and worth pinning down: the repo must exist *before* the
first scaffold file, because `git init` after the fact means the first commit is
one giant blob with no story, and every subsequent decision is hard to isolate.
This repo's first commit carries the reasoning for three architectural decisions
in its body, which only works because the history started before the code did.

**Skills before structure is a coin flip.**

Installing skills into an empty repo installs them into a repo with no opinion
about itself, so nothing tells you which of the twenty-seven are load-bearing.
Installing them after the skeleton means you can read the skeleton and throw away
the irrelevant half. The plan had this backwards; the effects are mild but real —
a process made of skills nobody needed is a process people stop following.

**The missing step, and this is the real one: no eval set.**

The original plan went requirement → build → deliver. For an agent product, that
skips the only artifact that pins quality down. A prose spec for an agent says what
it should *feel* like; an eval set says what it must *do*, and every downstream
argument — is this regression, is this good enough to ship, did that model upgrade
help — is unanswerable without one. This is why the flow in `.claude/skills/`
puts `spec` before `tickets` and makes "an eval set exists" the gate between them.

## The order this repo used, and why

1. **Decide the runtime's shape first.** Agent SDK, own loop, or a platform. This
   decision determines the file layout, the tool contract style, and what is
   testable. Reversing it later is a rewrite.
2. **Name the first real scenario.** Not the platform's features — one concrete
   thing one user does. Here: a viral reference becomes a shootable recipe. Without
   this, schemas are guesses.
3. **`git init` + repository hygiene.** Then the first commit can be a story.
4. **The schema layer.** Domain objects in one package, everything else imports
   them. Doing this fourth rather than fourteenth is the single highest-leverage
   ordering choice, because retrofitting it is a wide refactor precisely when
   momentum is highest.
5. **The runtime, with its limits.** The loop, budget enforcement, step recording,
   tool contracts against ports. Working code, tested.
6. **Skills, both sets.** Vendored engineering process plus the repo's own agent
   flow. Now there is a skeleton to read, so the choice of which to install is
   informed.
7. **`/init`, against real structure.** The output describes what exists, including
   what does not — see the "Current state" section, which says two applications are
   manifests only. That honesty is worth more than completeness.
8. **The documents that decide the work.** Thesis, ADRs, eval design, roadmap.
9. **The applications, last and thin.** A gateway that verifies and delivers, a
   workbench that surveys. Neither has agent logic in it.

## The pattern behind the order

Every step above exists to remove a decision from later work. Runtime shape removes
the "how do we call the model" decision. Schemas remove "what is a recipe". Eval
design removes "is this good enough". The applications come last because they
contain almost no decisions — they are surfaces over decisions already made.

Which gives the rule for the next repo: **order the work so that each step
eliminates a decision that later steps would otherwise have to make under
pressure.** Not by dependency, not by component size — by decision leverage.

## What this repo would do differently next time

Two things, both small.

The `/init` step would come after the applications exist, not before their first
line. Its "Current state" section is genuinely useful, and it would be more useful
still if it described a working end-to-end path rather than a manifest.

The first tracer ticket would be written before the fixtures it needs. The roadmap
specifies it; nobody has built it. That gap is the honest cost of doing the
foundations first — it is the right trade for a product whose risk is quality
rather than speed, and the wrong trade for one whose risk is demand.
