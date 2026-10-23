# Spec: milestone 1 tracer — one recipe, end to end

The first vertical slice. Deliberately not the workbench and not the bot: both
would be horizontal slices that demo nothing.

## Problem

The product's central claim is that a model can abstract a viral video well enough
that a brand's shooter would use the output. Nothing in this repo currently tests
that claim. The runtime exists, the schemas exist, and no recipe has ever been
produced.

## Solution

One path, running for real: a TikTok URL and a brand id go in; a persisted,
schema-valid recipe comes out; a human can read what happened; the eval harness can
score it.

## What must be true when it is done

1. A real URL goes in — not a fixture in a test file.
2. The model runs with the production system prompt.
3. It calls `get_brand_profile` and `analyze_reference_video` and receives real
   results.
4. The recipe validates against `Recipe` from `@mas/shared` and is persisted.
5. The run's steps are readable as a timeline — not a log dump.
6. The eval harness runs the `baseline-beauty` case and prints pass/fail for the
   deterministic rules.

## The experiment worth running alongside it

Same brand, same request, two runs: one where the recipe writer receives the
analysis, one where it receives only the URL. Judge both blind against the rubric
in `docs/evals/recipe-quality.md`.

This is the single most informative measurement in the roadmap. If the recipe
written *with* the analysis is not clearly better, the abstraction step is not
earning its cost, and the product's central claim needs revisiting before any
surface gets built on it.

## Decisions already made

**The vision analyser is a port.** `VisionAnalyzer` already exists in
`packages/core/src/tools/brand.ts`. The first real implementation can be a single
model call with the video frames attached; it must validate its output against
`ReferenceAnalysis` before returning, because a malformed analysis silently
becomes a bad script.

**Persistence is a port too.** No database decision is required for this tracer.
An in-memory implementation behind `RecipeStore` proves the loop and lets the
schema change cheaply; the tracer earns the database choice rather than
pre-empting it.

**The workbench shows the timeline via a server-rendered page.** No client state,
no design work. The point of this slice is that a human can read what happened,
not that it looks considered.

## Out of scope

Feishu delivery, authentication beyond a dev session, multi-brand, cost dashboards,
recipe editing, approval workflow. See `docs/roadmap.md` for which milestone owns
each.
