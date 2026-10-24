# 01: A real vision analyser behind the existing port

**What to build:** `VisionAnalyzer.analyze()` implemented against the provider
chosen by the spike (ticket 00, ADR 0007), so `analyze_reference_video` returns a
real `ReferenceAnalysis` for a real TikTok URL instead of throwing.

**Blocked by:** 00

**Status:** ready-for-agent

- [ ] A sample TikTok URL produces an analysis that validates against `ReferenceAnalysis`
- [ ] A URL that 404s returns a tool error, not an exception (ADR 0003)
- [ ] The analysis names a hook pattern from `HookPattern` and at least two beats
- [ ] Audio rights are reported as `unknown` when they cannot be determined — never guessed as `clearable`
- [ ] One unit test for the validation path, using a recorded response as the fixture
- [ ] Cost and latency of one analysis recorded in the ticket, so the budget ceiling can be set honestly
