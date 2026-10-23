# 0002. One shared schema package owns the domain, validated at every boundary

**Status:** accepted
**Date:** 2026-10-24

## Context

The model produces structured output that other layers must trust. The workbench
renders it; the eval harness asserts on it; the runtime persists it. If each layer
defines its own shape, a schema change becomes a coordinated edit across the
codebase with no compiler help, and "the type says it is a recipe but it does not
have beats" becomes a production bug rather than a type error.

Three alternatives were considered: (a) infer types from a database schema, (b) let
each package define what it needs, (c) one schema package imported everywhere.

## Decision

`packages/shared` defines every domain object with Zod, imports nothing from this
repo, and is the only place a type is defined. Validation happens at the
persistence boundary and wherever model output enters the system.

Zod over a schema-generation tool because the same definition produces three things
we need: a TypeScript type, a runtime validator, and a JSON schema for the model's
structured-output contract. One definition, three consumers.

## Consequences

**Easier:** model output is untrusted by default and cannot become a malformed
record; the eval harness asserts against the same types the runtime persists; the
UI cannot silently drift from the API.

**Harder:** every field added is a change to a package everything depends on. This
is intentional friction — it is the mechanism that stops speculative fields.

**Rule that follows from it:** every field must be read by something. A field that
no tool, no UI, and no eval reads is speculative, and later code will trust it
because it is typed. Delete it instead.

**Accepted:** `exactOptionalPropertyTypes` makes some pass-through code verbose
(`?: T | undefined`). The alternative is losing the distinction between "absent"
and "present but undefined", which matters when a model omits a field it meant to
set to null.
