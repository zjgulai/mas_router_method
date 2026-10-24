import type { VisionAnalyzer } from '@mas/core';
import { createVodVisionAnalyzer } from '@mas/core/adapters/vod';
import { analysisForUrl } from './fixtures.js';

/**
 * ADR 0007 selects a dedicated video-understanding service. Until ticket 00 picks
 * one, the real adapter deliberately refuses rather than falling back to a
 * model-plus-frames approach the ADR rejected.
 */
export function createVisionAnalyzer(options: { fake: boolean }): VisionAnalyzer {
  if (options.fake) {
    return {
      async analyze(input): Promise<unknown> {
        return analysisForUrl(input.url);
      },
    };
  }

  const apiKey = process.env['VOD_API_KEY'];
  if (apiKey === undefined || apiKey.trim().length === 0) {
    throw new Error(
      'VOD_API_KEY is required for the vod gateway (ADR 0007). Use --fake-vision to rehearse the loop; that does not validate the product claim.',
    );
  }
  const baseUrl = process.env['VOD_BASE_URL'];
  return createVodVisionAnalyzer({
    apiKey,
    model: process.env['VOD_MODEL'] ?? 'gemini-3.1-flash-lite',
    ...(baseUrl === undefined ? {} : { baseUrl }),
  });
}
