# 00: Choose the video-understanding provider

**What to build:** Run the spike in `docs/evals/vision-spike.md` against two
candidates on three clips, then append the decision to ADR 0007. This is a
measurement, not product code; nothing produced here ships.

**Blocked by:** None (needs API access and a human annotator)

**Status:** ready-for-human

- [ ] Ground truth for three clips: hook and beat boundaries, voiceover, rights
- [ ] Two candidates run on all three clips; raw responses saved under `docs/evals/vision-spike/`
- [ ] Every gate scored; failures eliminate rather than average
- [ ] Cost per analysis and p95 latency recorded (feeds ADR 0005's ceiling)
- [ ] ADR 0007 addendum written with vendor, price, retention terms, and evidence path

`ready-for-human` because the work needs vendor access and human judgement about
whether an analysis is actually right.
