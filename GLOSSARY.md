# Glossary

The words this product uses, and what they specifically mean here. Written to
disambiguate — where a word has a common meaning that would mislead, that is
called out.

## The artifact

**Recipe** — What the product delivers. A cloneable abstraction of a viral video,
re-bound to one brand: hook, beats, caption, hashtags, audio direction. Not a copy
of the source: a recipe transfers *what did the work*, never the words or footage.
The unit a human reviews and a shooter acts on.

**Reference** — The source viral TikTok post. Its media is transient (signed URLs,
deletions); its analysis is what the product keeps.

**Analysis** — The structured reading of a reference: hook pattern, beat skeleton,
shot list, voiceover, audio rights, caption formula, transferability. Produced by
exactly one tool (`analyze_reference_video`) and is the only input the recipe
writer may trust. A recipe written without one is a guess.

**Hook** — The first one to three seconds. Carries its own typed shape because it
is the highest-leverage element and the one generic models most often get wrong.

**Beat** — One narrative unit of a recipe, with a script line and a visual. The
unit a shooter acts on. Distinct from an *analysis beat*, which describes the
reference rather than the new video.

**Abstraction distance** — How far a recipe strays from its reference: 0 is a
near-literal copy, 1 is only the abstract pattern surviving. Declared per recipe
and read by reviewers first.

## Brand

**Brand profile** — The agent's standing brief: voice, audience, market,
guardrails, success criteria. Structured, because every field is read by a tool; a
field nobody reads does not belong in it.

**Guardrail** — A hard constraint the agent cannot talk its way past: prohibited
claims, banned topics, required disclaimers. Enforced at the tool layer, never in
the prompt — a prompt is a suggestion, and a guardrail is not.

**Success criteria** — What "good" means for a specific brand, as observable
rubric statements. The same wording is used by the eval judge, so the two cannot
drift.

## Runtime

**Run** — One execution of a workflow. The unit of cost, audit, and retry. Carries
its steps, token usage, cost, and both its workflow and model versions.

**Step** — One observable event inside a run: assistant text, tool call, tool
result, human input, error. Flat and append-only, so it can be streamed and
reviewed after the fact.

**Workflow** — A named, versioned sequence the runtime executes. Stored on every
run so old runs stay interpretable after the workflow changes.

**Port** — An interface the agent's tools are written against (`BrandStore`,
`VisionAnalyzer`), rather than a database or HTTP client. Lets the eval harness run
the real tool code against fakes.

## Quality

**Eval case** — An input plus the criteria deciding whether the output is
acceptable, with a note on what real-world failure it prevents. The unit of quality
measurement.

**should_fail case** — An eval case that exists to prove a guardrail actually
refuses. A passing suite with no such cases has tested that the agent *usually*
behaves, not that it *cannot* misbehave.

**Rubric score** — A judgement from an LLM judge against written criteria. Noisier
and more expensive than a deterministic check, so reserved for what genuinely needs
taste.

**Gate** — A CI rule turning a quality drop into a red build. Depends on
`should_fail` cases and a baseline, not on a remembered ideal.

## Surfaces

**Bot** — The Feishu surface. Where the work happens. Narrow by design: runs the
workflow, has no settings.

**Workbench** — The operator surface. Where the work is supervised: reviewing
recipes, inspecting runs, editing guardrails, reading scores. Used by fewer people,
more deliberately.

**Tracer bullet** — The first ticket: a narrow but complete path through model,
tool, schema, persistence, and UI. In an agent product it must include cost
tracking and a readable run, or it is a horizontal slice in disguise.
