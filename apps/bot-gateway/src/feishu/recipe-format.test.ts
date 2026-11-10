import { describe, expect, it } from 'vitest';
import type { Recipe } from '@mas/shared';
import { formatRecipeResult } from './recipe-format.js';

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 'rec_42',
    brandId: 'brd_00000000000002',
    title: 'Sunday Press — problem-agitation morning routine',
    status: 'draft',
    provenance: {
      referenceId: 'ref_1',
      abstractionDistance: 0.5,
      exclusions: [
        { element: '原视频的镜子镜头', reason: '画面版权归属创作者' },
        { element: '中文口播文案', reason: '只借结构不写原词' },
      ],
    },
    hook: {
      text: 'Mornings shouldn’t take an hour.',
      durationSec: 2,
      pattern: 'problem-agitation',
    },
    beats: [
      {
        kind: 'problem',
        durationSec: 6,
        script: 'Grinder. Kettle. Scale. Timer.',
        visual: 'Handheld, waist height, messy counter, four quick cuts.',
      },
      {
        kind: 'mechanism',
        durationSec: 8,
        script: 'This is a pod. One button.',
        visual: 'Static shot, pod next to machine.',
      },
    ],
    caption: 'One pod, one button, done.',
    hashtags: ['coffee', 'morning'],
    audio: { direction: 'Dry close voice, room tone underneath, no music.', rights: 'original' },
    createdAt: '2026-11-03T00:00:00Z',
    updatedAt: '2026-11-03T00:00:00Z',
    ...overrides,
  } as Recipe;
}

describe('formatRecipeResult', () => {
  it('emits an interactive card first with hook and recipeId, then the full text', () => {
    const [card, full] = formatRecipeResult(recipe(), { costUsd: 0.42 });
    expect(card?.msgType).toBe('interactive');
    const cardContent = JSON.parse(card!.content) as {
      header: { title: { content: string } };
      elements: unknown[];
    };
    expect(cardContent.header.title.content).toContain('Sunday Press');
    expect(JSON.stringify(cardContent)).toContain('Mornings shouldn’t take an hour');
    expect(JSON.stringify(cardContent)).toContain('rec_42');

    expect(full?.msgType).toBe('text');
    const text = (JSON.parse(full!.content) as { text: string }).text;
    expect(text).toContain('Grinder. Kettle. Scale. Timer.');
    expect(text).toContain('Handheld, waist height');
    expect(text).toContain('Dry close voice');
    expect(text).toContain('原视频的镜子镜头');
    expect(text).toContain('One pod, one button, done.');
  });

  it('carries the three review buttons with their action ids', () => {
    const [card] = formatRecipeResult(recipe(), { costUsd: 0.42 });
    const content = JSON.parse(card!.content) as {
      elements: { tag: string; actions?: { value: { action_id: string; recipe_id: string } }[] }[];
    };
    const action = content.elements.find((element) => element.tag === 'action');
    expect(action?.actions?.map((button) => button.value.action_id)).toEqual([
      'recipe.adopt',
      'recipe.revise',
      'recipe.reject',
    ]);
    expect(action?.actions?.every((button) => button.value.recipe_id === 'rec_42')).toBe(true);
  });

  it('truncates the full text at a boundary when over budget', () => {
    const big = recipe();
    big.beats = Array.from({ length: 12 }, (_, i) => ({
      kind: 'problem' as const,
      durationSec: 5,
      script: `line ${i} `.repeat(30),
      visual: `visual ${i} `.repeat(30),
    }));
    const [, full] = formatRecipeResult(big, { costUsd: 0.4, maxChars: 800 });
    const text = (JSON.parse(full!.content) as { text: string }).text;
    expect(text.length).toBeLessThanOrEqual(900);
    expect(text).toContain('（截断');
  });

  it('falls back to a summary text when the recipe is absent', () => {
    const [only] = formatRecipeResult(undefined, {
      costUsd: 0.4,
      fallbackSummary: 'hook + 4 beats',
      recipeId: 'rec_9',
    });
    expect(only?.msgType).toBe('text');
    expect(JSON.parse(only!.content).text).toContain('rec_9');
  });
});
