import type { MessagePayload } from './client.js';

export interface FormatOptions {
  format: 'text' | 'card';
  /** Maximum characters per Feishu message. */
  maxChars?: number;
  title?: string;
}

/**
 * Feishu has a generous payload limit, but long answers are hard to read in a
 * chat bubble. Split at paragraph boundaries and number the parts.
 */
export function formatAnswer(answer: string, options: FormatOptions): MessagePayload[] {
  const maxChars = options.maxChars ?? 3200;
  const parts = splitText(answer.trim(), maxChars);

  if (options.format === 'card') {
    return parts.map((part) => ({
      msgType: 'interactive' as const,
      content: JSON.stringify(buildCard(part, options.title ?? 'Main · 能力图谱咨询')),
    }));
  }

  return parts.map((part, index) => ({
    msgType: 'text' as const,
    content: JSON.stringify({
      text: parts.length === 1 ? part : `（${index + 1}/${parts.length}）\n${part}`,
    }),
  }));
}

export function formatError(message: string): MessagePayload {
  return {
    msgType: 'text',
    content: JSON.stringify({ text: message }),
  };
}

export function formatAck(): MessagePayload {
  return {
    msgType: 'text',
    content: JSON.stringify({ text: '收到，正在定位能力节点并核对仓库证据…' }),
  };
}

export function splitText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const parts: string[] = [];
  let rest = text;

  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars);
    let cut = window.lastIndexOf('\n\n');
    if (cut < maxChars * 0.5) cut = window.lastIndexOf('\n');
    if (cut < maxChars * 0.5) {
      cut = window.lastIndexOf('。');
      // Include the full stop in the part; cutting before it reads like a typo.
      if (cut >= maxChars * 0.5) cut += 1;
    }
    if (cut < maxChars * 0.5) cut = maxChars;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest.length > 0) parts.push(rest);
  return parts.filter((part) => part.length > 0);
}

function buildCard(markdown: string, title: string): unknown {
  return {
    config: { wide_screen_mode: true },
    header: {
      template: 'blue',
      title: { tag: 'plain_text', content: title },
    },
    elements: [
      { tag: 'markdown', content: markdown },
      { tag: 'hr' },
      {
        tag: 'note',
        elements: [
          {
            tag: 'plain_text',
            content: '基于仓库内方法文档与检查器回答；不替代业务判断。',
          },
        ],
      },
    ],
  };
}
