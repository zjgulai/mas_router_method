import { describe, expect, it } from 'vitest';
import { parseScore } from './rubric-judge.js';

describe('parseScore', () => {
  it('parses a clean judge response', () => {
    const text = '{"score": 0.8, "justification": "hook 使用品牌惯用的痛点开场"}';
    const result = parseScore(text, 'hook-strength', 'anthropic');
    expect(result.score).toBe(0.8);
    expect(result.justification).toContain('痛点');
    expect(result.dimension).toBe('hook-strength');
  });

  it('parses a response wrapped in prose', () => {
    const text = '评审结果如下：{"score": 0.55, "justification": "visual 列缺机位"} — 以上。';
    const result = parseScore(text, 'shootability', 'openai');
    expect(result.score).toBe(0.55);
  });

  it('rejects a score above 1', () => {
    expect(() => parseScore('{"score": 1.4, "justification": "x"}', 'voice-match', 'anthropic')).toThrow(
      /unusable output/,
    );
  });

  it('rejects a negative score', () => {
    expect(() => parseScore('{"score": -0.2, "justification": "x"}', 'voice-match', 'anthropic')).toThrow();
  });

  it('rejects an empty justification', () => {
    expect(() => parseScore('{"score": 0.9, "justification": ""}', 'voice-match', 'anthropic')).toThrow();
  });

  it('rejects a non-numeric score', () => {
    expect(() => parseScore('{"score": "high", "justification": "x"}', 'voice-match', 'anthropic')).toThrow();
  });

  it('rejects garbage output', () => {
    expect(() => parseScore('model refused to answer', 'transferability', 'anthropic')).toThrow();
  });
});
