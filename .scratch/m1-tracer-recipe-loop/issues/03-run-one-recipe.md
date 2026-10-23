# 03: Run one recipe end to end and print the timeline

**What to build:** A script — `packages/evals/src/try-one.ts` or similar — that takes
a brand id and a URL, calls `createRuntime().run()`, and prints the steps, the cost,
and the resulting recipe. This is the tracer: it either works or the claim is wrong.

**Blocked by:** 01, 02

**Status:** ready-for-agent

- [ ] Runs against the real model, real tools, real analyser
- [ ] Prints each step in order: tool name, summary, and token counts
- [ ] Prints total cost and duration
- [ ] Prints the recipe as readable text, not JSON
- [ ] Exits non-zero when the run fails, printing the run's `outcome.reason`
- [ ] Verified by running it on one real URL, with the output pasted into the ticket
- [ ] The `baseline-beauty` eval case runs through the same path and reports the deterministic rules
