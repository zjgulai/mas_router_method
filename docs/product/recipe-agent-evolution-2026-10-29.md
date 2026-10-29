# 业务落地演进方案：TikTok Recipe Agent 架构升级

**日期**：2026-10-29  
**目标**：将实战作战手卡中的高价值经验（结构变量分离、消融实验、两轮止损）注入到当前 TikTok 爆款 Recipe Agent 的核心运行时与评测体系中。

---

## 一、爆款拆解引擎升级：结构/变量分离器 (Structure & Variable Decoupler)

### 1.1 业务背景
TikTok 内容团队不缺灵感，缺的是把爆款视频抽象为可复刻模版的能力。旧版 Agent 容易直接进行全篇自由重写，导致原视频最核心的**转场节奏与黄金前 2 秒**发生漂移。

### 1.2 架构设计
在 `packages/shared/src/recipe.ts` 中增强 Schema 约束：

```typescript
export interface TikTokRecipeSchema {
  // 1. 固定结构骨架 (Structure - 绝对不可随意改变)
  structure: {
    hook_2s: {
      visual_action: string;      // 视觉抓眼动作（如快速推镜、意外道具）
      audio_cue: string;          // 声音线索/悬念台词
      target_emotion: string;      // 前2秒锁定的核心情绪（好奇/震惊/共鸣）
    };
    beat_skeleton: Array<{
      timestamp_range: string;    // 精确到秒的时间跨度 (如 "00:00 - 00:03")
      shot_function: string;      // 镜头功能 (痛点放大 / 反转 / 演示 / 证言 / CTA)
      pacing_bpm: 'fast' | 'medium' | 'slow';
    }>;
  };

  // 2. 品牌自变量 (Brand Variables - 逐层定制与合规替换)
  variables: {
    brand_anchor: string;         // 品牌/产品自然切入点
    voice_and_tone: string;       // 品牌人设与语气
    prohibited_claims: string[];  // 绝对禁限词（如防掉坑规则）
    props_replacement: Record<string, string>; // 道具替换映射
  };

  // 3. 剥离与放弃清单 (Deliberately Dropped)
  deliberately_dropped: Array<{
    original_element: string;
    drop_reason: string;
  }>;
}
```

---

## 二、评测体系增强：消融实验器 (Ablation Evaluator)

### 2.1 业务背景
当 Recipe 生成引入了多个 Prompt 约束（护栏、节奏、人设、时长、工具调用）时，容易导致 Prompt 膨胀（Context 污染与延迟增加），却不知道哪个机制真正产生了正向收益。

### 2.2 评估流程
在 `packages/evals/` 中增加自动消融实验运行器：

1. **基线测试 (Baseline)**：裸 Prompt（仅提供原视频与品牌名）。
2. **单变量加入 (Step-in)**：
   - `+ Hook 2s 约束`
   - `+ 品牌禁限词护栏`
   - `+ 镜头节拍时间线`
3. **消融度量指标**：
   - **拦截率 (Rejection Rate)**：在 `should_fail` 案例中是否成功拦截违规？
   - **可执行度 (Actionability Score)**：拍摄人员能否根据 Recipe 直接实拍？
   - **Context 成本**：Token 消耗与延迟增量。
4. **决策规则**：对评测分数提升小于 5% 且 Token 增加超 20% 的冗余约束，坚决予以删除或下沉为按需加载的 Skill。

---

## 三、运行时止损熔断机制 (Two-Turn Stop-Loss Line)

### 3.1 业务背景
在 Agent 自主修复或工具重试循环中，若模型陷入思维死胡同，往往会连续修改并引出新报错，导致 Token 快速烧尽且时间延误。

### 3.2 熔断判定逻辑
在 `packages/core/src/run-agent.ts` 的模型调度循环中植入：

```typescript
// 止损判定规则
if (consecutive_failures >= 2 && !has_verifiable_progress(last_error, current_error)) {
  // 1. 立即中断继续尝试
  // 2. 记录当前失败上下文快照与尝试过的假设
  // 3. 主动抛出清晰的结构化诊断报告，请求人工介入或重构输入
  return emit_stop_loss_report({
    root_cause_hypothesis: current_error,
    tried_patches: 2,
    recommendation: "连续两轮无实质进展，已触发止损熔断。请检查工具输入源或核对业务契约。"
  });
}
```
