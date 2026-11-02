import type { Recipe } from '@mas/shared';
import type { MessagePayload } from './client.js';

/**
 * Recipe delivery, two payloads: an interactive card for the glance (title,
 * hook, key numbers) and the full working text for the shooter. The card is
 * the review surface; the text is the shoot surface.
 */

export interface RecipeFormatOptions {
  costUsd: number;
  maxChars?: number;
  /** Used when the recipe object is unavailable but the run succeeded. */
  fallbackSummary?: string;
  recipeId?: string;
}

export function formatRecipeResult(
  recipe: Recipe | undefined,
  options: RecipeFormatOptions,
): [MessagePayload, ...MessagePayload[]] {
  if (recipe === undefined) {
    return [
      {
        msgType: 'text',
        content: JSON.stringify({
          text: `拆解完成（recipe ${options.recipeId ?? 'unknown'}，成本 $${options.costUsd.toFixed(2)}）。\n${options.fallbackSummary ?? ''}`,
        }),
      },
    ];
  }

  return [buildCardPayload(recipe, options.costUsd), buildFullTextPayload(recipe, options)];
}

function buildCardPayload(recipe: Recipe, costUsd: number): MessagePayload {
  const beatsCount = recipe.beats.length;
  const distance = recipe.provenance.abstractionDistance.toFixed(2);
  const card = {
    config: { wide_screen_mode: true },
    header: {
      template: 'green',
      title: { tag: 'plain_text', content: `Recipe · ${recipe.title}` },
    },
    elements: [
      {
        tag: 'markdown',
        content: `**Hook（${recipe.hook.durationSec}s · ${recipe.hook.pattern}）**\n${recipe.hook.text}`,
      },
      { tag: 'hr' },
      {
        tag: 'note',
        elements: [
          {
            tag: 'plain_text',
            content: `${recipe.id} · ${beatsCount} beats · 抽象距离 ${distance} · 音频 ${recipe.audio.rights} · $${costUsd.toFixed(2)} · 全文见下一条`,
          },
        ],
      },
    ],
  };
  return { msgType: 'interactive', content: JSON.stringify(card) };
}

function buildFullTextPayload(recipe: Recipe, options: RecipeFormatOptions): MessagePayload {
  const maxChars = options.maxChars ?? 3400;
  const lines: string[] = [
    `【全文】${recipe.title}（${recipe.id}）`,
    '',
    `Hook（${recipe.hook.durationSec}s）：${recipe.hook.text}`,
    ...recipe.beats.flatMap((beat, i) => [
      `${i + 1}. ${beat.kind}（${beat.durationSec}s）`,
      `   口播：${beat.script}${beat.translation !== undefined ? `（译：${beat.translation}）` : ''}`,
      `   画面：${beat.visual}`,
      ...(beat.onScreenText !== undefined ? [`   字幕：${beat.onScreenText}`] : []),
    ]),
    '',
    `Caption：${recipe.caption}`,
    `音频：${recipe.audio.direction}（${recipe.audio.rights}）`,
  ];
  if (recipe.provenance.exclusions.length > 0) {
    lines.push('排除项：');
    for (const ex of recipe.provenance.exclusions) {
      lines.push(`- ${ex.element} — ${ex.reason}`);
    }
  }

  let text = lines.join('\n');
  if (text.length > maxChars) {
    text = `${truncateAtLineBoundary(text, maxChars)}\n（截断，完整版见 workbench 审阅页）`;
  }
  return { msgType: 'text', content: JSON.stringify({ text }) };
}

function truncateAtLineBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.lastIndexOf('\n', maxChars);
  return text.slice(0, cut > maxChars * 0.5 ? cut : maxChars);
}
