import { ReferenceAnalysis } from '@mas/shared';
import type { VisionAnalyzer } from '../../tools/brand.js';

export interface VodVisionOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  /** Some OpenAI-compatible gateways name the video part `image_url`. */
  videoPart?: 'video_url' | 'image_url';
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://mmu.vod-qcloud.com/v1';
const DEFAULT_MODEL = 'gemini-3.1-flash-lite';

const SYSTEM_PROMPT = `You analyse one short-form video for a brand-content tool.
Return ONLY a JSON object, no prose and no markdown fences. Shape:
{
  "hook": { "pattern": one of ["curiosity-gap","pattern-interrupt","direct-callout","problem-agitation","result-first","contrarian-claim","ugc-confession"], "text": string, "durationSec": number, "whyItWorks": string },
  "beats": [{ "name": string, "startSec": number, "endSec": number, "purpose": string }] (at least 2, ordered),
  "shots": [{ "index": number, "kind": one of ["a-roll","b-roll","product-closeup","screen-recording","text-on-screen","transition","cta-card"], "startSec": number, "endSec": number, "action": string, "reuse": "reusable"|"reshoot-required" }] (at least 1),
  "voiceover": [{ "startSec": number, "endSec": number, "line": string, "translation": string? }],
  "audio": { "source": string, "rights": one of ["clearable","platform-library-only","not-reusable","unknown"] },
  "captionFormula": { "template": string, "example": string, "hashtagStrategy": string },
  "callToAction": { "text": string, "mechanism": string },
  "transferability": { "score": number 0..1, "blockers": string[] }
}
Rules:
- Timestamps must come from the actual video; do not round to whole scenes.
- If there is no speech, return an empty voiceover array. Never invent dialogue.
- If audio rights cannot be determined, use "unknown"; never guess "clearable".
- Keep "text" verbatim when there is speech; otherwise describe the opening visually.`;

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'object' && part !== null && 'text' in part) {
        const text = (part as { text?: unknown }).text;
        return typeof text === 'string' ? text : '';
      }
      return '';
    })
    .join('');
}

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('provider returned no JSON object');
  return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
}

/**
 * Video understanding through the local magpie `vod` gateway (ADR 0007).
 * The request shape follows the OpenAI-compatible chat-completions convention;
 * the exact video part name is gateway-specific and can be overridden.
 */
export interface VodVisionAnalyzer extends VisionAnalyzer {
  /** Same call as `analyze`, plus the provider's usage block for cost measurement. */
  analyzeDetailed(input: {
    url: string;
    brandContext: string;
  }): Promise<{ analysis: ReferenceAnalysis; usage: unknown }>;
}

export function createVodVisionAnalyzer(options: VodVisionOptions): VodVisionAnalyzer {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const model = options.model ?? DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs ?? 90_000;
  const videoPart = options.videoPart ?? 'video_url';
  const doFetch = options.fetchImpl ?? fetch;

  const analyzeDetailed = async (input: {
    url: string;
    brandContext: string;
  }): Promise<{ analysis: ReferenceAnalysis; usage: unknown }> => {
      if (options.apiKey.trim().length === 0) {
        throw new Error('VOD_API_KEY is not set; the vod adapter cannot call the gateway.');
      }

      const body = {
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Brand context: ${input.brandContext}\nAnalyse this reference: ${input.url}` },
              { type: videoPart, [videoPart]: { url: input.url } },
            ],
          },
        ],
      };

      let response: Response;
      try {
        response = await doFetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        throw new Error(`vod request failed: ${message}`);
      }

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 200).replace(/\s+/g, ' ');
        throw new Error(`vod returned ${response.status}: ${detail}`);
      }

      const payload = (await response.json()) as unknown;
      const choices = (payload as { choices?: { message?: { content?: unknown } }[] }).choices;
      const text = contentToText(choices?.[0]?.message?.content);
      if (text.trim().length === 0) throw new Error('vod returned an empty message');

      const parsed = ReferenceAnalysis.safeParse(extractJson(text));
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new Error(
          `vod response did not match ReferenceAnalysis: ${issue?.path.map(String).join('.') ?? 'root'} ${issue?.message ?? ''}`,
        );
      }
      return { analysis: parsed.data, usage: (payload as { usage?: unknown }).usage };
  };

  return {
    analyze: async (input) => (await analyzeDetailed(input)).analysis,
    analyzeDetailed,
  };
}
