import type { CapabilityNode, ConversationTurn, RetrievedChunk } from './types.js';

/**
 * Optional synthesis layer.
 *
 * The deterministic composer is the source of truth and always works. A model is
 * allowed to rewrite its output for readability, but it is never allowed to add
 * facts, commands, or citations that are not in the grounded answer. If the model
 * is unavailable, slow, or returns something unrecognisable, the grounded answer
 * ships instead.
 */
export interface LlmInput {
  question: string;
  grounded: string;
  node?: CapabilityNode;
  retrieved: RetrievedChunk[];
  history?: ConversationTurn[];
}

export interface LlmSynthesizer {
  readonly name: string;
  synthesize(input: LlmInput): Promise<string | null>;
}

type LlmMode = 'off' | 'auto' | 'anthropic' | 'openai';

export function createLlmFromEnv(env: NodeJS.ProcessEnv = process.env): LlmSynthesizer | null {
  const mode = (env['MAIN_AGENT_LLM'] ?? 'auto') as LlmMode;
  if (mode === 'off') return null;

  const anthropicKey = emptyToUndefined(
    env['ANTHROPIC_API_KEY'] ?? env['MAIN_AGENT_LLM_API_KEY'],
  );
  const openaiKey = emptyToUndefined(env['OPENAI_API_KEY'] ?? env['MAIN_AGENT_LLM_API_KEY']);

  if (mode === 'anthropic' || (mode === 'auto' && anthropicKey !== undefined)) {
    if (anthropicKey === undefined) return null;
    return new AnthropicSynthesizer({
      apiKey: anthropicKey,
      baseUrl: env['MAIN_AGENT_LLM_BASE_URL'] ?? 'https://api.anthropic.com',
      model: env['MAIN_AGENT_LLM_MODEL'] ?? 'claude-sonnet-4-6',
    });
  }

  if (mode === 'openai' || (mode === 'auto' && openaiKey !== undefined)) {
    if (openaiKey === undefined) return null;
    return new OpenAiSynthesizer({
      apiKey: openaiKey,
      baseUrl: env['MAIN_AGENT_LLM_BASE_URL'] ?? 'https://api.openai.com/v1',
      model: env['MAIN_AGENT_LLM_MODEL'] ?? 'gpt-4o-mini',
    });
  }

  return null;
}

interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

const SYSTEM_PROMPT = `你是 Main，一个「数据产品 × Agent Native builder」的能力图谱咨询 Agent。

规则：
1. 只使用用户消息中提供的【已核实答案】和【证据片段】。不得引入外部事实、命令、数字或文件名。
2. 用中文回答，结构固定：【结论】【定位】【依据】【下一步】【边界】【证据】。
3. 【下一步】必须是可执行动作；【证据】必须列出文件路径，不能编造路径。
4. 如果证据不足，直接说“仓库里没有这条依据”，并给出需要补充的信息。
5. 不要写“作为一个 AI”之类的套话；不要超过 1800 字。
6. 如果提供了对话历史，用它解析“它/那/第二步”等指代；不要重复历史里已经说过的长段内容。`;

function buildUserPrompt(input: LlmInput): string {
  const evidence = input.retrieved
    .filter((item) => item.chunk.kind !== 'capability')
    .slice(0, 6)
    .map(
      (item) =>
        `--- ${item.chunk.path} §${item.chunk.heading} (score ${item.score.toFixed(2)}) ---\n${item.chunk.text.slice(0, 900)}`,
    )
    .join('\n\n');

  return [
    ...(input.history !== undefined && input.history.length > 0
      ? [
          '【对话历史】',
          ...input.history.map(
            (turn) => `${turn.role}: ${turn.text.slice(0, 600)}`,
          ),
          '',
        ]
      : []),
    `用户问题：${input.question}`,
    '',
    '【已核实答案】',
    input.grounded,
    '',
    '【证据片段】',
    evidence.length > 0 ? evidence : '（无）',
  ].join('\n');
}

class AnthropicSynthesizer implements LlmSynthesizer {
  readonly name = 'anthropic';
  constructor(private readonly config: ProviderConfig) {}

  async synthesize(input: LlmInput): Promise<string | null> {
    try {
      const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: 1400,
          temperature: 0.2,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: buildUserPrompt(input) }],
        }),
        signal: AbortSignal.timeout(45_000),
      });

      if (!response.ok) return null;
      const payload = (await response.json()) as {
        content?: { type?: string; text?: string }[];
      };
      const text = (payload.content ?? [])
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text ?? '')
        .join('\n')
        .trim();
      return validateSynthesis(text, input);
    } catch {
      return null;
    }
  }
}

class OpenAiSynthesizer implements LlmSynthesizer {
  readonly name = 'openai';
  constructor(private readonly config: ProviderConfig) {}

  async synthesize(input: LlmInput): Promise<string | null> {
    try {
      const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: 0.2,
          max_tokens: 1400,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(input) },
          ],
        }),
        signal: AbortSignal.timeout(45_000),
      });

      if (!response.ok) return null;
      const payload = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = payload.choices?.[0]?.message?.content?.trim() ?? '';
      return validateSynthesis(text, input);
    } catch {
      return null;
    }
  }
}

function validateSynthesis(text: string, input: LlmInput): string | null {
  if (text.length < 80) return null;
  if (!text.includes('【结论】') || !text.includes('【下一步】')) return null;
  // A citation is mandatory. If the model dropped it, append the grounded
  // evidence rather than trusting a citation-free answer.
  if (!text.includes('【证据】')) {
    const sources = input.node?.sources.slice(0, 4) ?? [];
    if (sources.length === 0) return null;
    return `${text}\n\n【证据】\n${sources
      .map((source) => `- ${source.path}${source.heading ? ` §${source.heading}` : ''}`)
      .join('\n')}`;
  }
  return text;
}

function emptyToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value.trim().length === 0 ? undefined : value;
}
