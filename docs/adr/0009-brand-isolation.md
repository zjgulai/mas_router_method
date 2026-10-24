# 0009. Brand scope is an argument on every store call, enforced by tests

**Status:** accepted
**Date:** 2026-10-24

## Context

Every tool runs with a `scope: { brandId, actorId }`, and every store method in
the ports happens to take a `brandId`. That is convention, not enforcement. The
first adapter that forgets a `WHERE brand_id = ?` turns one brand's recipe into
another brand's data — a cross-tenant leak that is invisible in single-brand
testing and catastrophic in a pilot with two brands.

The model also must never be able to choose the scope. If `brandId` were a tool
argument, a prompt-injected instruction could read another brand's guardrails.

## Decision

**Scope is an argument, not ambient state.** Every port method takes `brandId` as
its first parameter. There is no `getById(id)` without a brand scope; a method
that needs a global lookup belongs to a separate admin port that the runtime does
not have access to.

**Scope comes from the request.** `createBrandTools` receives the scope from
`RuntimeDeps`/`AgentRunRequest`; it is closed over, never read from tool input.
No tool schema contains `brandId`.

**Adapters must filter.** Every SQL statement in an adapter includes the brand
predicate. A query assembled without it is a review-blocking bug, even if the
caller "always" passes the right id.

**Enforcement is a test, not a convention.** A shared adapter test suite runs
against every adapter (SQLite now, Postgres later) and asserts:

- brand A cannot read brand B's recipe, reference, or run by id;
- listing with brand A's id never returns brand B's rows;
- saving with a mismatched brand and artifact id fails loudly.

The same suite runs against the fake stores used by evals, so a fake cannot be
more permissive than production.

**Built 2026-10-24** as `packages/core/src/contracts/store-contract.ts`, with two
conformance tests: `packages/core/src/adapters/sqlite/contract.test.ts` and
`packages/evals/src/fixtures.contract.test.ts`. It lives in `core` because `core`
owns the ports; a copy in `evals` would be a third definition.

Building it found four places where the eval fake was more permissive than
SQLite, each of which had been hiding a real failure: `list()` returned `[]` (so
`analyze_reference_video` failed on every eval run), unknown brand ids were
fabricated instead of returning null, invalid recipes and invalid runs were
accepted without validation, and reference ids were derived from the URL (so two
brands pointing at one video collided). It also found a real SQLite bug:
`listRecipes` ordered by `created_at`, which ties at millisecond resolution, so an
agent saving two drafts in one turn got a wrong "newest first".

**Admin access is a separate port.** If the workbench later needs a cross-brand
view, it gets an explicit admin port with its own authorisation check. Never a
boolean flag on the existing port.

## Consequences

**Easier:** the isolation rule is mechanical and testable; a new adapter has a
suite to pass before it is trusted; the model cannot widen its own scope.

**Harder:** every method signature carries a parameter that is often the same
value; a global query needs a deliberate new port. That friction is the safety
mechanism.

**Accepted:** the test suite adds one fixture set per adapter. Compared with a
cross-brand leak in a pilot, that is cheap.

## What we would revisit

If a legitimate cross-brand feature appears (an agency strategist comparing
brands), it gets an explicit admin port and an ADR describing who may use it. The
runtime's brand-scoped tools stay scoped.
