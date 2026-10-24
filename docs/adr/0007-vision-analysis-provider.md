# 0007. Analyse references with a dedicated video-understanding service behind the port

**Status:** accepted (provider selection pending a spike)
**Date:** 2026-10-24
**Protocol:** [`docs/evals/vision-spike.md`](../evals/vision-spike.md)

## Context

`VisionAnalyzer.analyze({ url, brandContext })` is the product's only source of
truth about a reference. `GLOSSARY.md` is explicit: a recipe without an Analysis
is a guess.

Two classes of provider were considered:

- **General multimodal model with sampled frames.** No new vendor, one key, but
  temporal understanding is limited by which frames we choose. Hook timing, beat
  boundaries, and on-screen text changes are exactly what sampling tends to miss.
- **Dedicated video-understanding service.** Native temporal handling and
  timestamped output; adds a vendor, a key, and a per-minute cost.

The core bet is abstraction quality. If the Analysis is weak, the recipe is weak,
and the eval will measure the provider rather than the product.

## Decision

Use a **dedicated video-understanding service**, exposed only through
`VisionAnalyzer`. No vendor SDK may be imported outside the adapter.

**Provider selection** is a spike, not a guess. Run three references through two
candidates — the beauty baseline, the no-voiceover case, and the cross-category
case — and score:

| Dimension | Bar |
|---|---|
| Schema validity | `ReferenceAnalysis.parse` succeeds without repair |
| Timestamp accuracy | hook and beat boundaries within ±0.5s of a human read |
| Silent-video handling | produces on-screen text, never invents voiceover |
| Rights fields | audio rights and reuse flags populated |
| Cost per analysis | recorded, not guessed |
| p95 latency | recorded; the product promises minutes, not seconds |

The chosen vendor and price are recorded in an addendum to this ADR before the
tracer is built. Switching providers is an adapter change, not a rewrite, which
is why the class decision can be made now.

**Operational rules:**

- Timeout 90 seconds per reference; one retry on timeout or 5xx.
- On failure, return `err(text, retryable: true)`; never fabricate an Analysis.
- Validate against `ReferenceAnalysis` before storing; an invalid Analysis is a
  provider failure, not a recipe input.
- Store `provider` and `modelVersion` alongside every Analysis, and include them
  in the cache key.
- Log cost and latency per analysis; they are inputs to ADR 0005's budget.

## Consequences

**Easier:** the Analysis can carry timestamps and temporal structure; the eval
measures recipe quality rather than frame-sampling luck; swapping vendors is
contained.

**Harder:** a second vendor relationship, a second key, and a per-minute cost that
must be bounded. A provider outage blocks the product — the failure is visible and
retryable, but it is still a dependency.

**Accepted:** cost per analysis is unknown until the spike. The $2.00 per-run
ceiling in ADR 0005 includes it; if analysis alone approaches the ceiling, the
workflow needs a cheaper sampling strategy, not a higher ceiling.

## What we would revisit

If the spike shows a general multimodal model meets the timestamp and
silent-video bars at materially lower cost, this ADR is superseded. The port makes
that a measured comparison rather than a rewrite.
