# 04: The ablation — is the analysis actually earning its cost?

**What to build:** The same request, run twice — once with the analysis in the
recipe writer's context, once without — judged blind against the rubric. Results
written up as an ADR either way.

**Blocked by:** 03

**Status:** ready-for-human

- [ ] Two outputs for the same brand and request, one with and one without the analysis
- [ ] Judged blind by a person using the rubric in `docs/evals/recipe-quality.md`
- [ ] Cost of each path recorded
- [ ] The conclusion written as an ADR: analysis earns its cost, or it does not
- [ ] If it does not, the roadmap's central claim is revisited before milestone 2 starts

This ticket is the reason milestone 1 exists. It is `ready-for-human` because the
judgement is the deliverable — an agent scoring its own ablation is measuring the
wrong thing.
