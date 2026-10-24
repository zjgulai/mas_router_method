import { describe, expect, it } from 'vitest';
import type { ReferenceAnalysis } from '@mas/shared';
import { createVodVisionAnalyzer } from './index.js';

const analysis: ReferenceAnalysis = {
  hook: { pattern: 'problem-agitation', text: 'Tired of long routines?', durationSec: 2, whyItWorks: 'Names a pain.' },
  beats: [
    { name: 'problem', startSec: 2, endSec: 8, purpose: 'Agitate' },
    { name: 'mechanism', startSec: 8, endSec: 16, purpose: 'Show the fix' },
  ],
  shots: [
    { index: 0, kind: 'a-roll', startSec: 0, endSec: 8, action: 'Person at a mirror', reuse: 'reshoot-required' },
  ],
  voiceover: [{ startSec: 2, endSec: 8, line: 'It used to take an hour.' }],
  audio: { source: 'original voiceover', rights: 'clearable' },
  captionFormula: { template: '<pain>? <fix>', example: 'Tired? Try this.', hashtagStrategy: 'category' },
  callToAction: { text: 'Try it tonight', mechanism: 'Low effort' },
  transferability: { score: 0.7, blockers: [] },
};

function okResponse(content: unknown): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function analyzer(fetchImpl: typeof fetch, apiKey = 'test-key') {
  return createVodVisionAnalyzer({ apiKey, fetchImpl, baseUrl: 'http://vod.test/v1' });
}

describe('vod vision adapter', () => {
  it('sends an OpenAI-compatible request with the video part', async () => {
    let body: string | undefined;
    const fake: typeof fetch = async (_input, init) => {
      body = init?.body as string;
      return okResponse(JSON.stringify(analysis));
    };

    const result = await analyzer(fake).analyze({ url: 'https://tiktok.test/v/1', brandContext: 'skincare' });
    expect(result).toEqual(analysis);

    const parsed = JSON.parse(body ?? '{}') as {
      model: string;
      messages: { content: { type: string; video_url?: { url: string } }[] }[];
    };
    expect(parsed.model).toBe('gemini-3.1-flash-lite');
    const parts = parsed.messages[1]?.content ?? [];
    expect(parts.some((part) => part.type === 'video_url' && part.video_url?.url === 'https://tiktok.test/v/1')).toBe(true);
  });

  it('accepts content parts and fenced JSON', async () => {
    const fake: typeof fetch = async () =>
      okResponse([{ type: 'text', text: `\`\`\`json\n${JSON.stringify(analysis)}\n\`\`\`` }]);
    await expect(analyzer(fake).analyze({ url: 'u', brandContext: 'b' })).resolves.toEqual(analysis);
  });

  it('rejects a response that does not match ReferenceAnalysis', async () => {
    const fake: typeof fetch = async () => okResponse(JSON.stringify({ hook: {} }));
    await expect(analyzer(fake).analyze({ url: 'u', brandContext: 'b' })).rejects.toThrow(
      /ReferenceAnalysis/,
    );
  });

  it('rejects a non-2xx response with the status', async () => {
    const fake: typeof fetch = async () => new Response('upstream exploded', { status: 502 });
    await expect(analyzer(fake).analyze({ url: 'u', brandContext: 'b' })).rejects.toThrow(/502/);
  });

  it('refuses to call without a key', async () => {
    let called = false;
    const fake: typeof fetch = async () => {
      called = true;
      return okResponse(JSON.stringify(analysis));
    };
    await expect(analyzer(fake, '  ').analyze({ url: 'u', brandContext: 'b' })).rejects.toThrow(
      /VOD_API_KEY/,
    );
    expect(called).toBe(false);
  });
});
