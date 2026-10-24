# Vision provider spike

This is the procedure that closes ADR 0007. It chooses the video-understanding
service behind `VisionAnalyzer`, and it produces the addendum that records the
choice. It is a measurement, not a product feature: no code from this spike ships.

**Time-box:** half a day, including human annotation. **Stop condition:** three
clips, two candidates, one decision. Do not expand the sample because the results
are close; a tie is broken by cost, not by more clips.

## What this spike decides

- Which provider implements `VisionAnalyzer` for the tracer.
- The cost and p95 latency of one analysis, which feed the `$2.00` ceiling in
  ADR 0005.
- Whether the provider can express the rights fields the eval needs.

It does **not** decide the recipe prompt, the storage layer, or the model used for
recipe writing. Those are ADR 0005/0006/0008.

## The three clips

Pick three public TikTok references. They are chosen to expose the failure modes
the eval already cares about, not to be representative:

| Slot | Property | Why |
|---|---|---|
| A | Spoken, 15–45s, clear hook | The common path; establishes the baseline |
| B | Music and on-screen text only, no speech | Models invent voiceover here; ADR 0007 gates on it |
| C | Different category from the brand, 30–60s | Tests whether the analysis preserves mechanism when content changes |

Selection rules:

- Public, no login required to view.
- Rights status knowable (trending sound flagged, or clearly original audio).
- Under 60 seconds; longer clips make timestamp scoring noisy.
- No private individuals as the main subject.

Record each clip's URL, duration, and rights status in the score sheet. Do not
download or commit the media; the provider fetches it, and only the derived
Analysis is stored.

## Ground truth, annotated by a human

Before running any candidate, watch each clip once and write down:

- hook start and end (seconds, one decimal)
- number of beats, and each beat's start time
- whether there is voiceover (yes/no)
- whether on-screen text carries meaning
- audio rights: `clearable` / `not-reusable` / `unknown`
- the one-sentence reason the clip works

This is the only ground truth in the spike. Two annotated clips are enough to
score; the third is for the cross-category judgement.

## Candidates

Pick two dedicated video-understanding services. Record for each:

- vendor and API version
- pricing unit (per minute / per request) and the price at the time of the spike
- whether it returns timestamps natively or only a summary
- data-retention terms (does the vendor keep the video?)

If a candidate cannot return timestamped structure, it is out before scoring — the
product needs beat boundaries, not a summary.

## Procedure

1. **Annotate** the three clips (above). Store in `docs/evals/vision-spike/ground-truth.md`.
2. **Run** each candidate on each clip through a throwaway script under
   `scripts/spike/`, never in `packages/`. Save the raw response as
   `docs/evals/vision-spike/<candidate>-<clip>.json`. Redact keys.
3. **Validate.** Feed the response through `ReferenceAnalysis.parse`. Record pass
   or the exact parse error. Do not repair by hand — a provider that needs repair
   fails the gate.
4. **Score timestamps.** Compare hook and beat boundaries with the annotation.
   Record the mean absolute error in seconds.
5. **Check the silent clip.** Did it invent voiceover? Did it produce on-screen
   text? Either failure is a gate failure.
6. **Check rights fields.** Are they populated, and is `unknown` used honestly
   rather than guessed as `clearable`?
7. **Measure cost and latency.** Three runs per candidate; record each, then p95.

## Scoring and decision

Gates first — any failure eliminates the candidate:

- [ ] `ReferenceAnalysis.parse` succeeds on all three clips
- [ ] hook and beat boundary MAE ≤ 0.5s
- [ ] silent clip: no invented voiceover, on-screen text captured
- [ ] rights fields populated; `unknown` never upgraded to `clearable`
- [ ] returns within the 90-second timeout, with retry not required

Among candidates that pass every gate:

1. Lower cost per analysis wins.
2. If within 20%, lower p95 latency wins.
3. If still tied, choose the one with the better data-retention terms.

A candidate that fails a gate is not "close"; it is out. Do not average a gate
failure into a score.

## Deliverables

| Artifact | Path |
|---|---|
| Ground truth | `docs/evals/vision-spike/ground-truth.md` |
| Raw responses | `docs/evals/vision-spike/<candidate>-<clip>.json` |
| Score sheet | `docs/evals/vision-spike/scores.md` |
| Decision | Addendum in `docs/adr/0007-vision-analysis-provider.md` |
| Ticket update | `.scratch/m1-tracer-recipe-loop/issues/01-vision-analyser-port.md` |

### Score sheet shape

```markdown
| Candidate | Version | Clip | Parse | Hook MAE | Beat MAE | Silent OK | Rights OK | Cost | p95 |
|---|---|---|---|---|---|---|---|---|---|
```

### Addendum shape (append to ADR 0007)

```markdown
## Addendum: provider selection (YYYY-MM-DD)

**Chosen:** <vendor, API version>
**Rejected:** <vendor> — <which gate it failed>
**Cost:** $<x> per analysis (clip A) / $<y> (clip C)
**p95 latency:** <n>s
**Data retention:** <what the vendor keeps, for how long>
**Evidence:** docs/evals/vision-spike/scores.md
```

## Guardrails

- No production code changes during the spike. The adapter is written after the
  decision, against the ticket.
- No API keys in the repo. Read them from the environment; redact raw responses.
- Do not commit source video or audio. Only derived Analysis JSON.
- Respect each service's terms of use and the platform's terms; a spike is not a
  licence to scrape.
- If neither candidate passes, record that as the result and revisit the class
  decision in ADR 0007. A failed spike is a finding, not a reason to lower the bar.
