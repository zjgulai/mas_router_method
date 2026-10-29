import type { ConsultAnswer } from './types.js';

/**
 * Optional LLM judge for the real-question eval.
 *
 * The deterministic rubric in the eval runner is always available. This judge is
 * only used when `MAIN_AGENT_JUDGE=llm` and an API key is present. It scores the
 * same three dimensions, so the two can be compared over time.
 */
export interface JudgeInput {
  question: string;
  answer: ConsultAnswer;
}

export interface JudgeResult {
  directAnswer: number;
  actionable: number;
  evidence: number;
  score: number;
  notes: string[];
  provider: 'anthropic' | 'openai';
}

export interface LlmJudge {
  readonly name: 'anthropic' | 'openai';
  judge(input: JudgeInput): Promise<JudgeResult | null>;
}

type JudgeMode = 'off' | 'auto' | 'llm';

export function createLlmJudgeFromEnv(env: NodeJS.ProcessEnv = process.env): LlmJudge | null {
  const mode = (env['MAIN_AGENT_JUDGE'] ?? 'off') as JudgeMode;
  if (mode === 'off') return null;

  const anthropicKey = emptyToUndefined(
    env['ANTHROPIC_API_KEY'] ?? env['MAIN_AGENT_JUDGE_API_KEY'],
  );
  const openaiKey = emptyToUndefined(env['OPENAI_API_KEY'] ?? env['MAIN_AGENT_JUDGE_API_KEY']);

  if (anthropicKey !== undefined) {
    return new ProviderJudge({
      provider: 'anthropic',
      apiKey: anthropicKey,
      baseUrl: env['MAIN_AGENT_JUDGE_BASE_URL'] ?? 'https://api.anthropic.com',
      model: env['MAIN_AGENT_JUDGE_MODEL'] ?? 'claude-sonnet-4-6',
    });
  }
  if (openaiKey !== undefined) {
    return new ProviderJudge({
      provider: 'openai',
      apiKey: openaiKey,
      baseUrl: env['MAIN_AGENT_JUDGE_BASE_URL'] ?? 'https://api.openai.com/v1',
      model: env['MAIN_AGENT_JUDGE_MODEL'] ?? 'gpt-4o-mini',
    });
  }
  return null;
}

interface ProviderConfig {
  provider: 'anthropic' | 'openai';
  apiKey: string;
  baseUrl: string;
  model: string;
}

const SYSTEM_PROMPT = `你是 Agent 回答质量评审。

对给定问题和回答，按三项各打 0 或 1：
- directAnswer：回答是否直接回应问题，而不是只给通用原则。
- actionable：下一步是否包含可执行动作（命令、检查、明确的判断步骤）。
- evidence：是否给出可核实证据（文件路径、检查器、数据来源）。

只返回 JSON，不要解释：
{"directAnswer":0或1,"actionable":0或1,"evidence":0或1,"notes":["最多三条"]}`;

class ProviderJudge implements LlmJudge {
  readonly name: 'anthropic' | 'openai';
  constructor(private readonly config: ProviderConfig) {
    this.name = config.provider;
  }

  async judge(input: JudgeInput): Promise<JudgeResult | null> {
    try {
      const user = [
        `问题：${input.question}`,
        '',
        '回答：',
        input.answer.text.slice(0, 2400),
      ].join('\n');

      const text =
        this.config.provider === 'anthropic'
          ? await this.callAnthropic(user)
          : await this.callOpenAi(user);
      return parseJudge(text, this.config.provider);
    } catch {
      return null;
    }
  }

  private async callAnthropic(user: string): Promise<string> {
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: 300,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: user }],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) return '';
    const payload = (await response.json()) as { content?: { type?: string; text?: string }[] };
    return (payload.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('\n');
  }

  private async callOpenAi(user: string): Promise<string> {
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        temperature: 0,
        max_tokens: 300,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) return '';
    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return payload.choices?.[0]?.message?.content ?? '';
  }
}

function parseJudge(text: string, provider: 'anthropic' | 'openai'): JudgeResult | null {
  const match = /\{[\s\S]*\}/.exec(text);
  if (match === null) return null;
  try {
    const parsed = JSON.parse(match[0]) as {
      directAnswer?: unknown;
      actionable?: unknown;
      evidence?: unknown;
      notes?: unknown;
    };
    const directAnswer = toBinary(parsed.directAnswer);
    const actionable = toBinary(parsed.actionable);
    const evidence = toBinary(parsed.evidence);
    if (directAnswer === undefined || actionable === undefined || evidence === undefined) {
      return null;
    }
    const notes = Array.isArray(parsed.notes)
      ? parsed.notes.filter((note): note is string => typeof note === 'string').slice(0, 3)
      : [];
    return {
      directAnswer,
      actionable,
      evidence,
      score: (directAnswer + actionable + evidence) / 3,
      notes,
      provider,
    };
  } catch {
    return null;
  }
}

function toBinary(value: unknown): number | undefined {
  if (value === 0 || value === false) return 0;
  if (value === 1 || value === true) return 1;
  return undefined;
}

function emptyToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value.trim().length === 0 ? undefined : value;
}
