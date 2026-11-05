import type { CardActionEvent } from '@larksuiteoapi/node-sdk';

/**
 * Inbound card actions.
 *
 * The transport is not this module's concern: both the HTTP webhook and the
 * WebSocket dispatcher hand it a `CardActionEvent` that the SDK has already
 * normalised. What lives here is the part every expert bot shares — the action
 * id contract, the registry, and the response shape Feishu accepts.
 */

export interface CardActionToast {
  type: 'success' | 'info' | 'warning' | 'error';
  content: string;
}

export interface CardActionResponse {
  toast?: CardActionToast;
  /** Replace the source card. Omit to leave the card unchanged. */
  card?: { type: 'raw'; data: unknown };
}

export interface CardActionContext {
  actionId: string;
  recipeId?: string;
  value: Record<string, unknown>;
  event: CardActionEvent;
}

export type CardActionHandler = (
  context: CardActionContext,
) => CardActionResponse | Promise<CardActionResponse>;

/**
 * A registry rather than a switch: each bot adds its own action ids without
 * editing the gateway. An unknown id is answered with a warning toast, not an
 * exception — a button whose handler was removed should tell the user, not
 * break the callback.
 */
export class CardActionRegistry {
  private readonly handlers = new Map<string, CardActionHandler>();

  constructor(
    private readonly fallback: CardActionHandler = (context) => ({
      toast: { type: 'warning', content: `未识别的操作：${context.actionId}` },
    }),
  ) {}

  register(actionId: string, handler: CardActionHandler): this {
    this.handlers.set(actionId, handler);
    return this;
  }

  has(actionId: string): boolean {
    return this.handlers.has(actionId);
  }

  async dispatch(event: CardActionEvent): Promise<CardActionResponse> {
    const value = isRecord(event.action.value) ? event.action.value : {};
    const actionId = actionIdFor(event, value);
    const handler = this.handlers.get(actionId) ?? this.fallback;
    return handler({
      actionId,
      ...(typeof value['recipe_id'] === 'string' && value['recipe_id'].length > 0
        ? { recipeId: value['recipe_id'] }
        : {}),
      value,
      event,
    });
  }
}

/** The action id is `value.action_id`; older cards fall back to the button name. */
export function actionIdFor(
  event: CardActionEvent,
  value: Record<string, unknown>,
): string {
  const fromValue = value['action_id'];
  if (typeof fromValue === 'string' && fromValue.length > 0) return fromValue;
  if (typeof event.action.name === 'string' && event.action.name.length > 0) {
    return event.action.name;
  }
  return event.action.tag;
}

/** True when a raw payload is a card callback rather than a message event. */
export function isCardActionPayload(payload: unknown): boolean {
  if (!isRecord(payload)) return false;
  const header = payload['header'];
  if (isRecord(header) && header['event_type'] === 'card.action.trigger') return true;
  const event = payload['event'];
  return isRecord(event) && event['type'] === 'card.action.trigger';
}

/** The raw callback body the SDK normaliser expects. */
export function cardActionBody(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;
  return isRecord(payload['event']) ? payload['event'] : payload;
}

/** The recipe buttons every delivered Recipe card carries. */
export function createRecipeActionRegistry(): CardActionRegistry {
  return new CardActionRegistry()
    .register('recipe.adopt', () => ({
      toast: { type: 'success', content: '已记录采纳，运营会跟进排期。' },
    }))
    .register('recipe.revise', () => ({
      toast: { type: 'info', content: '已记录修改意向，运营会带着你的意见回来。' },
    }))
    .register('recipe.reject', () => ({
      toast: { type: 'info', content: '已记录不用，本条不再跟进。' },
    }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
