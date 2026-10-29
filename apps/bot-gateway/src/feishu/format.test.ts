import { describe, expect, it } from 'vitest';
import { formatAnswer, formatError, splitText } from './format.js';

describe('feishu formatting', () => {
  it('keeps a short answer in one text message', () => {
    const parts = formatAnswer('【结论】短答案', { format: 'text' });
    expect(parts).toHaveLength(1);
    expect(parts[0]?.msgType).toBe('text');
    expect(JSON.parse(parts[0]?.content ?? '{}')).toEqual({ text: '【结论】短答案' });
  });

  it('splits a long answer and numbers the parts', () => {
    const text = `${'第一段。'.repeat(400)}\n\n${'第二段。'.repeat(400)}`;
    const parts = formatAnswer(text, { format: 'text', maxChars: 800 });
    expect(parts.length).toBeGreaterThan(1);
    expect(JSON.parse(parts[0]?.content ?? '{}')).toMatchObject({
      text: expect.stringContaining('（1/'),
    });
  });

  it('renders a card with a markdown element', () => {
    const parts = formatAnswer('**结论**\n内容', { format: 'card' });
    expect(parts).toHaveLength(1);
    expect(parts[0]?.msgType).toBe('interactive');
    const card = JSON.parse(parts[0]?.content ?? '{}') as {
      header?: { title?: { content?: string } };
      elements?: { tag?: string }[];
    };
    expect(card.header?.title?.content).toContain('Main');
    expect(card.elements?.some((element) => element.tag === 'markdown')).toBe(true);
  });

  it('does not cut a sentence when a boundary is available', () => {
    const text = `${'甲'.repeat(40)}。${'乙'.repeat(40)}。${'丙'.repeat(40)}。`;
    const parts = splitText(text, 50);
    expect(parts[0]?.endsWith('。')).toBe(true);
  });

  it('formats an error as a text message', () => {
    const payload = formatError('出错了');
    expect(JSON.parse(payload.content)).toEqual({ text: '出错了' });
  });
});
