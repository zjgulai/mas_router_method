# 0008. Version every workflow, and gate prompt changes on the eval baseline

**Status:** accepted
**Date:** 2026-10-24

## Context

A run records `workflow: { name, version }`, but the value is supplied by the
caller and nothing enforces that it changes when the behaviour changes. The system
prompt lives inline in `index.ts`; the tool descriptions live in `tools/brand.ts`.
Both are prompt-visible, both change model behaviour, and neither has a version.

Without versioning, "the recipes got worse last Tuesday" is unanswerable: the run
transcript does not say which prompt produced it, and the eval baseline does not
say which prompt it measured.

## Decision

A **workflow** is the tuple of everything that shapes model behaviour: the system
prompt, the tool set, each tool's description and schema, and the model. Its
`name` and `version` are required on every `AgentRunRequest` and persisted on
every `Run`.

**Any change to that tuple bumps the version.** This includes wording changes that
look cosmetic, because prompt wording is behaviour, not documentation.

**A version bump requires an eval run** against the current baseline, before the
change merges. The run records `workflowVersion` (already in `SuiteResult`), so
the baseline is always attributable.

**Prompt text is reviewed like code.** It lives in a named constant, not in a
string scattered through the call site. A diff to it appears in review with the
same weight as a diff to logic.

**Old versions are retained.** A run from three weeks ago must remain
interpretable; do not delete a workflow definition when its successor ships. A
version is removed only when no retained run references it.

## Consequences

**Easier:** a quality change is attributable to a specific prompt and model; the
eval baseline has a version on both sides; rollback is "point the default back at
the previous version", not "reconstruct the old prompt from memory".

**Harder:** prompt iteration has a cost — one eval run per change. That cost is
the reason to batch cosmetic edits rather than dribble them out. It also means a
prompt cannot be "quickly fixed" in production without a record.

**Accepted:** local experiments may run unversioned prompts, but they are not
allowed to produce the baseline. The baseline is always a versioned workflow.

## What we would revisit

If prompt iteration becomes the bottleneck, add a fast subset (the four guardrail
cases plus the baseline beauty case) for iteration, while the full fourteen remain
the merge gate. A fast subset is a convenience, never the release gate.
