# 02: SYSTEM_PROMPT 两条指令 + tool description 明确化

**What to build:** 模型拿到明确的行为契约：无声参考怎么写、跨语言怎么填、terse/比较类请求必须落 recipe。

**Blocked by:** None

**Status:** done (2026-10-30)

- [x] `packages/core/src/index.ts` SYSTEM_PROMPT 增加 Match-the-sound 条（silent→onScreenText；跨语言→translation 全覆盖）
- [x] SYSTEM_PROMPT 增加 terse/comparative 条（假设补全落 recipe；选择类给理由并落 recipe）
- [x] `packages/core/src/tools/brand.ts` translation 描述改为明确触发条件
- [x] 事故记录：prompt 文本内用反引号截断了 JS 模板串（TS1005），已去除
- [x] core 31 tests + 全仓 11/11 任务绿
