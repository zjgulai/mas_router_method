# 0006. SQLite now, Postgres before the bot; one RunStore and explicit retention

**Status:** accepted
**Date:** 2026-10-24

## Context

The ports exist (`BrandStore`, `ReferenceStore`, `RecipeStore`), but no adapter
does. `Run` is fully specified in `packages/shared`; nothing writes it. The
workbench timeline and the eval baseline both need run history, and the first
tracer cannot demo an end-to-end flow without persisting a recipe.

Two related loose ends:

- `config.ts` declares `sessionDir`, but nothing reads it. Session resume is not
  implemented, so the config currently promises durability it does not provide.
- Retention is unstated. Reference videos are third-party media with rights
  implications; keeping them "just in case" is the wrong default.

## Decision

**Storage for the tracer:** SQLite through adapters in
`packages/core/src/adapters/sqlite/`, implementing the existing ports. SQLite is
chosen for zero operations and a single file that can be inspected during
development.

**Migration path:** Postgres before Milestone 2 (the Feishu bot). The ports are
the seam; the migration is an adapter swap plus an export/import script. All SQL
lives in the adapter, never in a tool or a service. A dialect-specific query
outside the adapter is a bug.

**A new port: `RunStore`.** `save(run)`, `get(runId)`, `listByBrand(brandId,
limit)`. `Run.steps` is stored as JSON text; the run row carries status, usage,
trigger, workflow version, model, and timestamps as columns so they can be
queried without parsing steps.

**Session persistence is out of scope for now.** Delete `sessionDir` from
`config.ts` until resume is implemented and has a real consumer. When it returns,
it returns with a test that proves a resumed run continues the same session.

**Retention defaults** (revisit at pilot):

| Data | Retention | Why |
|---|---|---|
| Recipe | Indefinite | The product artifact; a brand may need it a year later |
| Run + steps | 90 days | Debugging window; long enough for a pilot, short enough to bound PII |
| Reference record + Analysis | 365 days | Analysis is what the product keeps; re-analysis is expensive |
| Source video media | **Never stored** | Rights and storage cost; only the URL and derived Analysis are kept |

**Redaction at write time.** `RunStep.summary` is truncated to 2,000 characters
by construction; adapters must also reject writes containing obvious secret
patterns (`sk-`, bearer tokens, long hex keys) and replace them with
`<REDACTED>`. Retention cannot fix a transcript that was never safe to store.

**Analysis cache key:** `(provider, modelVersion, platformVideoId)`. The same
reference analysed twice with the same provider and model returns the stored
Analysis rather than paying twice.

## Consequences

**Easier:** the tracer can persist a recipe and a run; the workbench has history
to render; the eval harness can compare runs; retention is a documented default
rather than an accident.

**Harder:** a second adapter when Postgres arrives; SQLite's single-writer limit
means concurrent bot traffic cannot use it in production. That is acceptable
because the bot is Milestone 2, which is exactly when the migration is due.

**Accepted:** deleting `sessionDir` removes a config key someone may have set.
That is better than leaving a key that does nothing.

## What we would revisit

If the pilot needs cross-device session continuity before Milestone 2, session
persistence moves earlier and gets its own ADR. If reference retention creates
legal exposure, shorten it; the analysis, not the source, is the asset.
