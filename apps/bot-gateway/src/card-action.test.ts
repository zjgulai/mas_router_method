import { describe, expect, it } from 'vitest';
import type { CardActionEvent } from '@larksuiteoapi/node-sdk';
import {
  CardActionRegistry,
  actionIdFor,
  cardActionBody,
  createRecipeActionRegistry,
  isCardActionPayload,
} from './card-action.js';

function event(value: unknown, name?: string): CardActionEvent {
  return {
    messageId: 'om_1',
    chatId: 'oc_1',
    operator: { openId: 'ou_user' },
    action: { value, tag: 'button', ...(name !== undefined ? { name } : {}) },
  };
}

describe('CardActionRegistry', () => {
  it('dispatches a registered action with the recipe id', async () => {
    const seen: string[] = [];
    const registry = new CardActionRegistry().register('recipe.adopt', (context) => {
      seen.push(context.recipeId ?? 'no-recipe');
      return { toast: { type: 'success', content: 'ok' } };
    });

    const response = await registry.dispatch(
      event({ action_id: 'recipe.adopt', recipe_id: 'rec_1' }),
    );

    expect(response.toast?.content).toBe('ok');
    expect(seen).toEqual(['rec_1']);
  });

  it('falls back to the button name when value has no action_id', () => {
    expect(actionIdFor(event({}, 'recipe.revise'), {})).toBe('recipe.revise');
  });

  it('answers an unknown action with a warning toast', async () => {
    const response = await new CardActionRegistry().dispatch(event({ action_id: 'nope' }));
    expect(response.toast?.type).toBe('warning');
    expect(response.toast?.content).toContain('nope');
  });

  it('acknowledges all three recipe buttons', async () => {
    const registry = createRecipeActionRegistry();
    for (const id of ['recipe.adopt', 'recipe.revise', 'recipe.reject']) {
      expect(registry.has(id)).toBe(true);
      const response = await registry.dispatch(event({ action_id: id, recipe_id: 'rec_1' }));
      expect(response.toast?.content.length).toBeGreaterThan(0);
    }
  });
});

describe('card action payload detection', () => {
  it('recognises the v2 header shape', () => {
    expect(
      isCardActionPayload({
        header: { event_type: 'card.action.trigger' },
        event: { action: { value: { action_id: 'x' } } },
      }),
    ).toBe(true);
  });

  it('recognises the v1 event-type shape', () => {
    expect(isCardActionPayload({ event: { type: 'card.action.trigger' } })).toBe(true);
  });

  it('does not claim a message event', () => {
    expect(isCardActionPayload({ header: { event_type: 'im.message.receive_v1' } })).toBe(false);
  });

  it('unwraps the event body for the SDK normaliser', () => {
    const inner = { action: { value: {} } };
    expect(cardActionBody({ header: {}, event: inner })).toBe(inner);
    expect(cardActionBody(inner)).toBe(inner);
  });
});
