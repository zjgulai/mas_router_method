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
          // Feishu sends `null` for ids that do not apply (e.g. `user_id` on a
          // tenant-level event). `optional()` alone rejects null and silently
          // drops the whole message.
          open_id: z.string().nullish(),
          user_id: z.string().nullish(),
          union_id: z.string().nullish(),
        })
        .optional(),
      sender_type: z.string().optional(),
    }),
    message: z.object({
      message_id: z.string(),
      chat_id: z.string(),
      chat_type: z.enum(['p2p', 'group']),
      message_type: z.string(),
      /** Present when the message is a reply in a thread/topic. */
      thread_id: z.string().nullish(),
      root_id: z.string().nullish(),
      parent_id: z.string().nullish(),
      /**
       * JSON-encoded string for text messages: `{"text":"..."}`. Some SDK
       * transports hand the already-parsed object instead, so accept both.
       */
      content: z.union([z.string(), z.record(z.string(), z.unknown())]),
      mentions: z
        .array(
          z.object({
            key: z.string(),
            name: z.string().optional(),
            /**
             * The event payload uses `{ open_id }`; the message-detail API uses a
             * bare open_id string. Accept both — rejecting one silently drops
             * every group message, which is exactly the bug this product exists
             * to make visible.
             */
            id: z
              .union([z.string(), z.object({ open_id: z.string().nullish() })])
              .optional(),
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
  /** Open ids of everyone mentioned. The gateway compares these to its own bot id. */
  mentionedOpenIds: string[];
  /** Display names of everyone mentioned, for tenants that do not expose open ids. */
  mentionedNames: string[];
  /** Feishu thread id, when the message is a reply in a thread. */
  threadId?: string;
  /** Root message id of the thread. */
  rootId?: string;
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
  if (event.message.message_type !== 'text' && event.message.message_type !== 'post') return null;

  const senderOpenId = event.sender.sender_id?.open_id ?? undefined;
  if (senderOpenId === undefined) return null;

  const parsedText = extractText(event.message.content, event.message.message_type);
  if (parsedText === null) return null;
  let text = parsedText;

  // Mention placeholders look like `@_user_1`. Strip them, but remember whether
  // there were any: in a group, an unaddressed message is not ours to answer.
  const mentions = event.message.mentions ?? [];
  const hadMention = mentions.length > 0;
  for (const mention of mentions) {
    text = text.split(mention.key).join('');
  }
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length === 0) return null;

  const mentionedOpenIds = mentions
    .map((mention) =>
      typeof mention.id === 'string' ? mention.id : mention.id?.open_id,
    )
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  const mentionedNames = mentions
    .map((mention) => mention.name)
    .filter((name): name is string => typeof name === 'string' && name.length > 0);

  return {
    eventId: header?.event_id ?? event.message.message_id,
    messageId: event.message.message_id,
    chatId: event.message.chat_id,
    chatType: event.message.chat_type,
    senderOpenId,
    text,
    // In a 1:1 chat every message is addressed to the bot.
    addressedToBot: event.message.chat_type === 'p2p' || hadMention,
    mentionedOpenIds,
    mentionedNames,
    ...(typeof event.message.thread_id === 'string' && event.message.thread_id.length > 0
      ? { threadId: event.message.thread_id }
      : {}),
    ...(typeof event.message.root_id === 'string' && event.message.root_id.length > 0
      ? { rootId: event.message.root_id }
      : {}),
  };
}

function extractText(
  content: string | Record<string, unknown>,
  messageType: string,
): string | null {
  let parsed: unknown;
  if (typeof content === 'string') {
    try {
      parsed = JSON.parse(content);
    } catch {
      return null;
    }
  } else {
    parsed = content;
  }

  if (messageType === 'text') {
    if (typeof parsed === 'object' && parsed !== null) {
      const text = (parsed as { text?: unknown }).text;
      if (typeof text === 'string') return text;
    }
    return null;
  }

  if (messageType === 'post') {
    // Feishu rich text: { title, content: [[{tag:'text', text:'...'}, {tag:'at', user_id:'...'}]] }
    const out: string[] = [];
    const visit = (value: unknown): void => {
      if (typeof value === 'string') return;
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        return;
      }
      if (typeof value !== 'object' || value === null) return;
      const record = value as Record<string, unknown>;
      if (typeof record['title'] === 'string') out.push(record['title']);
      if (typeof record['text'] === 'string') out.push(record['text']);
      if (Array.isArray(record['content'])) visit(record['content']);
    };
    visit(parsed);
    const text = out.join(' ').replace(/\s+/g, ' ').trim();
    return text.length > 0 ? text : null;
  }

  return null;
}

function payloadType(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const event = (payload as { event?: { type?: unknown } }).event;
  return typeof event?.type === 'string' ? event.type : undefined;
}
