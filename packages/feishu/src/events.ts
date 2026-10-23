import { z } from 'zod';

/**
 * Only the parts of the Feishu event schema this product uses.
 *
 * Feishu's full event model is enormous. Typing all of it would be a maintenance
 * burden for zero benefit — what we need is: who sent it, where, what they said,
 * and whether the bot was addressed. Everything else is passed through untouched
 * so a future feature can read it without a schema change here.
 */
export const FeishuMessageEvent = z.object({
  schema: z.string().optional(),
  /**
   * Feishu has two event generations in the wild. v2 events carry `header`;
   * v1 events (still delivered by some older subscriptions) do not, and put the
   * event type inside `event` instead. Treating header as required would reject
   * every v1 delivery, so it is optional and the idempotency key falls back.
   */
  header: z
    .object({
      event_id: z.string(),
      event_type: z.string(),
      create_time: z.string().optional(),
      token: z.string().optional(),
      tenant_key: z.string().optional(),
    })
    .optional(),
  event: z.object({
    sender: z.object({
      sender_id: z
        .object({
          open_id: z.string().optional(),
          user_id: z.string().optional(),
          union_id: z.string().optional(),
        })
        .optional(),
      sender_type: z.string().optional(),
    }),
    message: z.object({
      message_id: z.string(),
      chat_id: z.string(),
      chat_type: z.enum(['p2p', 'group']),
      message_type: z.string(),
      /** JSON-encoded string for text messages: `{"text":"..."}`. */
      content: z.string(),
      mentions: z
        .array(
          z.object({
            key: z.string(),
            name: z.string().optional(),
            id: z.object({ open_id: z.string().optional() }).optional(),
          }),
        )
        .optional(),
    }),
  }),
});
export type FeishuMessageEvent = z.infer<typeof FeishuMessageEvent>;

export interface NormalisedMessage {
  /** Stable id for idempotency — Feishu retries deliveries. */
  eventId: string;
  messageId: string;
  chatId: string;
  chatType: 'p2p' | 'group';
  senderOpenId: string;
  /** The text with @-mention placeholders removed. This is the agent's prompt. */
  text: string;
  /** True when the message addresses the bot. In a group, ignore everything else. */
  addressedToBot: boolean;
}

/**
 * Turn a raw payload into the one shape the gateway acts on.
 *
 * Returns null for events we deliberately ignore (non-text messages, bot senders,
 * unknown event types) rather than throwing: Feishu retries on non-2xx, so
 * throwing on an unhandled event type produces an infinite redelivery loop.
 */
export function normaliseMessageEvent(payload: unknown): NormalisedMessage | null {
  const parsed = FeishuMessageEvent.safeParse(payload);
  if (!parsed.success) return null;

  const { header, event } = parsed.data;
  const eventType = header?.event_type ?? payloadType(payload);
  if (eventType !== 'im.message.receive_v1') return null;

  // A bot replying to itself is the classic infinite loop in a group chat.
  if (event.sender.sender_type === 'app') return null;
  if (event.message.message_type !== 'text') return null;

  const senderOpenId = event.sender.sender_id?.open_id;
  if (senderOpenId === undefined) return null;

  let text = '';
  try {
    const content = JSON.parse(event.message.content) as { text?: unknown };
    if (typeof content.text === 'string') text = content.text;
  } catch {
    return null;
  }

  // Mention placeholders look like `@_user_1`. Strip them, but remember whether
  // there were any: in a group, an unaddressed message is not ours to answer.
  const mentions = event.message.mentions ?? [];
  const hadMention = mentions.length > 0;
  for (const mention of mentions) {
    text = text.split(mention.key).join('');
  }
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length === 0) return null;

  return {
    eventId: header?.event_id ?? event.message.message_id,
    messageId: event.message.message_id,
    chatId: event.message.chat_id,
    chatType: event.message.chat_type,
    senderOpenId,
    text,
    // In a 1:1 chat every message is addressed to the bot.
    addressedToBot: event.message.chat_type === 'p2p' || hadMention,
  };
}

function payloadType(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const event = (payload as { event?: { type?: unknown } }).event;
  return typeof event?.type === 'string' ? event.type : undefined;
}
