import type { BrandProfile, Recipe } from '@mas/shared';

/**
 * The rubric judge (docs/evals/recipe-quality.md — "Rubric (LLM judge)").
 *
 * Each dimension scores 0–1. The judge prompt is built from the brand's own
 * `successCriteria` wording, so the rubric and the profile cannot drift —
 * the doc's "enforced by construction" requirement.
 *
 * Failure is a skip, never a silent pass: the provider being down must look
 * like a skip for the same reason an outage is not a refusal.
 */
export type RubricDimension = 'voice-match' | 'hook-strength' | 'transferability' | 'shootability';

export interface RubricScore {
  dimension: RubricDimension;
  score: number;
  justification: string;
  provider: 'anthropic' | 'openai';
}

export interface RubricJudgeConfig {
  provider: 'anthropic' | 'openai';
  apiKey: string;
  model: string;
  baseUrl?: string;
}

const DIMENSION_PROMPTS: Record<RubricDimension, string> = {
  'voice-match':
    'voice match — 现有受众能否一听就认出这是该品牌的声音？语域、口头禅、价值主张、禁区话题是否与品牌档案一致？',
  'hook-strength':
    'hook strength — 前 3 秒是否制造了"继续看下去"的理由？注意区分真实钩力与套路化悬念。',
  transferability:
    'transferability — 参考视频的机制（结构/心理引擎）是否真迁移到了该品牌品类，还是只换了表层？品牌方声明的 abstractionDistance 是否属实？',
  shootability:
    'shootability — 一个 shooter 拿着 visual 列能否零提问执行？机位、道具、场景、时间线是否具体到可执行？',
};

const SYSTEM_PROMPT = `你是 Recipe 质量评审员。输入是一个为品牌生成的短视频 Recipe 与该品牌档案的要点。

对指定维度打 0–1 分（0.1 步进），判断标准以品牌档案的 successCriteria 与维度定义为准。

只返回 JSON，不要解释：
{"score": 0.0到1.0, "justification": "不超过60字，引用 Recipe 中的具体证据"}`;

/**
 * One judge call per dimension — a single call scoring all four makes the
 * scores correlates and a parse failure costs all four. Failures throw; the
 * caller decides whether that means skip.
 */
export async function judgeDimension(
  dimension: RubricDimension,
  recipe: Recipe,
  brand: BrandProfile,
  config: RubricJudgeConfig,
): Promise<RubricScore> {
  const user = [
    `评审维度：${DIMENSION_PROMPTS[dimension]}`,
    '',
    `品牌：${brand.name}（${brand.category ?? '品类未标注'}）`,
    `品牌 voice 要点：${JSON.stringify(brand.voice).slice(0, 900)}`,
    `品牌 successCriteria：${JSON.stringify(brand.successCriteria ?? {}).slice(0, 900)}`,
    '',
    'Recipe：',
    `hook(${recipe.hook.durationSec}s): ${recipe.hook.text}`,
    ...recipe.beats.map(
      (beat) => `${beat.kind}(${beat.durationSec}s): ${beat.script} | visual: ${beat.visual}`,
    ),
    `caption: ${recipe.caption}`,
    `provenance: referenceId=${recipe.provenance.referenceId}, abstractionDistance=${recipe.provenance.abstractionDistance.toFixed(2)}`,
    ...(recipe.provenance.exclusions.length > 0
      ? [`exclusions: ${recipe.provenance.exclusions.map((e) => e.element).join('；')}`]
      : []),
  ].join('\n');

  const text =
    config.provider === 'anthropic' ? await callAnthropic(user, config) : await callOpenAi(user, config);
  return parseScore(text, dimension, config.provider);
}

export function parseScore(text: string, dimension: RubricDimension, provider: RubricScore['provider']): RubricScore {
  const jsonText = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  const parsed = JSON.parse(jsonText) as { score?: unknown; justification?: unknown };
  const score = typeof parsed.score === 'number' ? parsed.score : Number.NaN;
  const justification = typeof parsed.justification === 'string' ? parsed.justification.trim() : '';
  if (Number.isNaN(score) || score < 0 || score > 1 || justification.length === 0) {
    throw new Error(`rubric judge returned unusable output for ${dimension}: ${text.slice(0, 200)}`);
  }
  return { dimension, score, justification, provider };
}

async function callAnthropic(user: string, config: RubricJudgeConfig): Promise<string> {
  const base = (config.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '');
  const response = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 300,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`judge anthropic ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const payload = (await response.json()) as { content?: { type?: string; text?: string }[] };
  return (payload.content ?? [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('');
}

async function callOpenAi(user: string, config: RubricJudgeConfig): Promise<string> {
  const base = (config.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 300,
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`judge openai ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return payload.choices?.[0]?.message?.content ?? '';
}

export function createRubricJudgeFromEnv(env: NodeJS.ProcessEnv = process.env): RubricJudgeConfig | null {
  if ((env['EVAL_RUBRIC'] ?? 'off') === 'off') return null;
  const anthropicKey = env['ANTHROPIC_API_KEY'];
  if (anthropicKey !== undefined && anthropicKey !== '') {
    return {
      provider: 'anthropic',
      apiKey: anthropicKey,
      model: env['EVAL_RUBRIC_MODEL'] ?? 'claude-sonnet-4-6',
      ...(env['ANTHROPIC_BASE_URL'] === undefined ? {} : { baseUrl: env['ANTHROPIC_BASE_URL'] }),
    };
  }
  const openaiKey = env['OPENAI_API_KEY'];
  if (openaiKey !== undefined && openaiKey !== '') {
    return {
      provider: 'openai',
      apiKey: openaiKey,
      model: env['EVAL_RUBRIC_MODEL'] ?? 'gpt-4o-mini',
    };
  }
  return null;
}
