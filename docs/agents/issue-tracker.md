# Issue tracker

**Local markdown, under `.scratch/<feature-slug>/issues/`.**

This repo has no git remote yet, so `gh issue create` has nowhere to write. When a
remote exists, switch to GitHub Issues and update this file; the skills read this
file, not their own defaults.

## Convention

One file per ticket, numbered in dependency order (blockers first):

```
.scratch/<feature-slug>/
  spec.md
  issues/
    01-shared-schema.md
    02-tool-contracts.md
    03-tracer-recipe-loop.md
```

Each ticket uses this shape:

```markdown
# <NN>: <Title>

**What to build:** the end-to-end behaviour this ticket makes work, from the
user's perspective — not a layer-by-layer implementation list.

**Blocked by:** <NN> / None (can start immediately)

**Status:** ready-for-agent | ready-for-human | needs-info | needs-triage | wontfix

- [ ] Acceptance criterion
```

Identifiers are stable. Renumbering a ticket orphans the references in every
blocking edge, and in any eval case that cites it.

## Grading a ticket

A ticket is `ready-for-agent` when it can be completed from the ticket text alone,
without a conversation. If completing it needs a decision the ticket does not
contain, it is `ready-for-human` and the missing decision is the real work.
