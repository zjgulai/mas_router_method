import { normaliseMessageEvent, type NormalisedMessage } from '@mas/feishu';
import type { MainAgentConfig } from '../config.js';
import type { BotIdentity } from './client.js';

export type { NormalisedMessage };

/** Wrap a WS event payload into the same shape the HTTP normaliser expects. */
export function normaliseWsEvent(
  data: unknown,
  fallbackEventId?: string,
): NormalisedMessage | null {
  if (typeof data !== 'object' || data === null) return null;
  const record = data as { event_id?: unknown; message?: { message_id?: unknown } };
  const eventId =
    typeof record.event_id === 'string'
      ? record.event_id
      : typeof record.message?.message_id === 'string'
        ? record.message.message_id
        : fallbackEventId;
  if (eventId === undefined) return null;

  return normaliseMessageEvent({
    header: { event_id: eventId, event_type: 'im.message.receive_v1' },
    event: data,
  });
}

/**
 * Decide whether this message is addressed to this bot.
 *
 * `normaliseMessageEvent` answers "was anyone mentioned"; this answers "was *this
 * bot* mentioned". In a group, answering @someone-else is the fastest way to make
 * a bot feel broken.
 */
export function shouldRespond(
  message: NormalisedMessage,
  identity: BotIdentity,
  groupMode: MainAgentConfig['groupMode'],
): boolean {
  if (message.chatType === 'p2p') return true;
  if (groupMode === 'all') return true;
  if (!message.addressedToBot) return false;

  const botOpenId = identity.openId;
  if (botOpenId !== undefined && message.mentionedOpenIds.includes(botOpenId)) return true;

  const botName = identity.name;
  if (
    botName !== undefined &&
    message.mentionedNames.some((name) => name.toLowerCase() === botName.toLowerCase())
  ) {
    return true;
  }

  // If the identity lookup failed, fall back to "any mention". This is better
  // than a silent bot, and the startup log says the identity is unknown.
  if (botOpenId === undefined && botName === undefined) return true;

  return false;
}

export function isAllowed(message: NormalisedMessage, config: MainAgentConfig): boolean {
  if (config.allowedChatIds.size > 0 && !config.allowedChatIds.has(message.chatId)) return false;
  if (config.allowedOpenIds.size > 0 && !config.allowedOpenIds.has(message.senderOpenId))
    return false;
  return true;
}
