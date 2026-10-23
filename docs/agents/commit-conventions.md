# Commit conventions

## Format

```
<type>(<scope>): <subject>

<body — why, not what>
```

**Types:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `build`.
**Scopes:** the package name without prefix — `core`, `shared`, `workbench`,
`gateway`, `feishu`, `evals`, `docs`, `repo`.

Subject is imperative, lowercase, no trailing period, under 72 characters.

## What the body is for

The diff already says what changed. The body says **why**, and for this repo that
answer is often about the agent rather than the code:

- A prompt change: what was wrong with the old instruction, and which eval case
  showed it.
- A tool-contract change: what the model was doing wrong that the old contract
  invited.
- A schema change: which consumer needed the field, which is the test of whether it
  belongs.

A commit that changes a prompt without naming an eval case is a commit that cannot
be reviewed, because there is no other evidence that the change is an improvement.

## Two things that get their own commit, always

**Eval baseline snapshots.** `packages/evals/runs/` is committed separately from the
code change that produced it, so the score delta is readable on its own and a
reviewer can revert the code without losing the record.

**Vendored skill updates.** `.claude/skills/` changes are a dependency bump, not a
feature. Keep them out of feature commits so a behaviour change is never explained
by "a skill silently changed".

## Branches

`main` is the trunk. Work happens on short-lived branches named
`<type>/<slug>` — `feat/tracer-recipe-loop`, `fix/tool-throw-on-404`.

No merge commits on trunk; rebase before merging. The history is meant to be
readable as a sequence of decisions, which is the only reason a solo repo's history
is worth reading at all.
