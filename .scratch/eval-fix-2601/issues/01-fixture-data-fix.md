# 01: fixture 数据修正（silent audio.source + zh 语言信号）

**What to build:** eval fixture 的参考分析不再向模型撒谎——无声参考不声称有 original voiceover，中文参考的 voiceover line 带真实语言信号。

**Blocked by:** None

**Status:** done (2026-10-30)

- [x] `packages/evals/src/fixtures.ts`：silent 时 audio.source = 'music and on-screen text only, no speech'
- [x] zh 参考的 voiceover line 改为中文原文 + translation 字段（语言信号进模型上下文）
- [x] shared schema 未动（ReferenceAnalysis/VoiceoverSegment 已有表达力）
- [x] evals 81 tests 全绿
