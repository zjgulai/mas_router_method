---
name: anb-manage
description: Manage the project's own record — requirements, tickets, incidents, evidence, receipts, artifacts. Use when asked what to do next, whether a ticket can be closed, to file a new ticket or incident, or when something needs to move between states.
disable-model-invocation: true
argument-hint: "What do you need to record, close, or find out?"
---

# Manage the project's record

**Open by asking: "what are we recording — something we intend to do, or something that happened?"**

That is the fork that matters, and it is the only one. A ticket is planned work. An incident
is something that happened to you. Filing one as the other is how a ticket stops meaning
anything: it becomes half plan, half postmortem, and neither.

## Where things live

Read `work/LAYOUT.md` before answering anything about where a file goes. The rule is one
line: **if it changes state it goes in `work/`, if it does not it goes in `docs/`.**

- `work/designs/` — the four-question records from the design stage; once confirmed they
  are a spec the build and verify stages read, not a document
- `work/tickets/` — planned work, cross-session only
- `work/incidents/` — unplanned, with its own entry point
- `work/requirements/` — one sentence each, can be dropped
- `work/evidence/` — a re-runnable command and its raw output. Append-only.
- `work/receipts/` — who received what, and how they confirmed. Append-only.
- `work/artifacts/` — anything with ongoing cost: scripts, flags, dashboards, cron jobs

## The four things you will be asked to do

### "The docs say N of something and I think it changed"

Run `node scripts/facts.mjs`. It prints every number the project quotes about itself,
computed from disk. Then `--check` compares the documents against those values.

Do not update the document first. The document might be right and the disk might be
surprising — `facts` tells you which. And if a number has genuinely changed, `facts` is
where the new one is derived, so the doc and the script agree by construction rather than
by remembering.

Run `node scripts/work.mjs status`. Answer from its output, not from memory.

Do not summarise it into a sentence like "things look fine". The output has a `needs you`
section for a reason: it lists things that are actually waiting. If it is empty, say so plainly.
If it is not, lead with the first item.

Two numbers in that output are worth reading aloud, because they are the ones people
quietly get wrong:

- **awaiting-verification** — work that exists but has not been proven. Not done.
- **how long something has been in-progress** — a ticket untouched for two weeks is not
  in progress, it is abandoned with extra steps.

### "Can I close this ticket?"

Check three things, in this order:

1. **Does it have evidence?** `evidence: [E-xxx]` in the frontmatter, and the file must exist.
   No evidence means no close — `work move` will refuse, and that refusal is correct.
2. **Does the evidence prove the ticket, or something adjacent?** Read the `## 这条证据能证明什么`
   and `## 不能证明什么` sections. A test suite proving the parser works does not prove the
   provider is reachable.
3. **Is there a check that has actually failed at least once?** If this ticket's work was
   verified only by things that have never gone red, the verification is unproven.

Then: `node scripts/work-move.mjs <ID> done`.

### "File this"

Pick the register using the fork above, then create the file in the right state directory.

- A ticket in `work/tickets/open/T-NNN-<slug>.md`
- An incident in `work/incidents/open/INC-NNN-<slug>.md`

The id must match the filename and must not already exist. Frontmatter carries `id`, `title`,
`stage`, `needs`. Keep the body to: what to do, completion criteria as checkboxes, why it is
still open if it is.

**Only file a ticket if the work spans sessions.** Something finished and verified inside one
conversation does not need a ticket, and creating one makes the register a diary — diaries are
not read.

### "Is this design still current?"

Read `work/designs/confirmed/`. A record that has been overtaken moves to
`superseded` with `work-move.mjs` — never edited in place, because the record of
what you decided last time is the only evidence about whether the decision was
right. `node scripts/design.mjs refusals` prints what the newest one currently says,
which is the quickest way to see whether a stage is reading a stale one.

### "Something went wrong"

That is an incident, not a ticket. `INC-` prefix, `work/incidents/open/`.

An incident records: what happened, when, what it broke, what you did, and whether it is
contained. It does not disappear when fixed — it moves to `closed` with what you learned.
Incidents are how a project remembers its own scars.

## After any change

```bash
node scripts/work.mjs check    # records are valid
node scripts/layout.mjs        # files are where LAYOUT.md says
node scripts/facts.mjs --check # numbers quoted in docs match what is on disk
```

All three must pass.

`layout` failing means a file is in the wrong home — the beginning of the duplicate problem
this structure exists to prevent.

`facts` failing means a document is quoting a number that has changed. This happens every
time something is added: the page says "15 skills", you add one, and now the page is wrong.
Nobody notices, because a stale number looks exactly like a fresh one. When `facts` reports a
mismatch, do not adjust the number until you have recounted with a second method —
`node scripts/facts.mjs` prints the values it derived from disk.

## Things you must not do

- **Do not count a record as done because the code exists.** Code existing and behaviour being
  witnessed are different facts. The tickets in this repo that say `awaiting-verification` are
  there precisely because their code is finished and their proof is missing.
- **Do not update a ticket's state by editing text.** State is the directory. Move it with the
  script, or it will disagree with itself.
- **Do not put an ADR in `work/`.** ADRs are permanent; they have no state machine. They live in
  `docs/adr/`.
- **Do not create a second home for something.** If a kind of information has a directory, use it.
  `layout` will fail, and it is right to.

## When the numbers look wrong

`check` and `layout` are the two commands that can tell you the record is broken. If a count
looks off — five tickets on disk, four reported — do not adjust the expectation. Find the
missing one. Every tool in this directory has had a bug of exactly that shape, and each was
found by comparing a count to what was on disk.
