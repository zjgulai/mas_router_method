import { describe, expect, it } from 'vitest';
import { createLlmJudgeFromEnv } from './judge.js';

describe('LLM judge factory', () => {
  it('is disabled by default', () => {
    expect(createLlmJudgeFromEnv({})).toBeNull();
  });

  it('does not create a judge without a key', () => {
    expect(createLlmJudgeFromEnv({ MAIN_AGENT_JUDGE: 'llm' })).toBeNull();
    expect(
      createLlmJudgeFromEnv({ MAIN_AGENT_JUDGE: 'llm', ANTHROPIC_API_KEY: '   ' }),
    ).toBeNull();
  });

  it('creates an Anthropic judge when a key is present', () => {
    const judge = createLlmJudgeFromEnv({
      MAIN_AGENT_JUDGE: 'llm',
      ANTHROPIC_API_KEY: 'sk-ant-test',
    });
    expect(judge?.name).toBe('anthropic');
  });

  it('creates an OpenAI judge when only an OpenAI key is present', () => {
    const judge = createLlmJudgeFromEnv({
      MAIN_AGENT_JUDGE: 'llm',
      OPENAI_API_KEY: 'sk-test',
    });
    expect(judge?.name).toBe('openai');
  });
});
