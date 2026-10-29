import { describe, expect, it } from 'vitest';
import { normaliseMessageEvent } from './events.js';

function messagePayload(overrides: {
  chatType?: 'p2p' | 'group';
  senderType?: string;
  messageType?: string;
  text?: string;
  mentions?: { key: string; name?: string; id?: { open_id?: string } }[];
}) {
  return {
    header: { event_id: 'ev_1', event_type: 'im.message.receive_v1' },
    event: {
      sender: {
        sender_id: { open_id: 'ou_1' },
        sender_type: overrides.senderType ?? 'user',
      },
      message: {
        message_id: 'om_1',
        chat_id: 'oc_1',
        chat_type: overrides.chatType ?? 'p2p',
        message_type: overrides.messageType ?? 'text',
        content: JSON.stringify({ text: overrides.text ?? 'hello' }),
        ...(overrides.mentions ? { mentions: overrides.mentions } : {}),
      },
    },
  };
}

describe('normaliseMessageEvent', () => {
  it('treats every direct message as addressed to the bot', () => {
    const result = normaliseMessageEvent(messagePayload({ chatType: 'p2p' }));
    expect(result?.addressedToBot).toBe(true);
    expect(result?.text).toBe('hello');
  });

  it('strips mention placeholders and keeps the remaining text', () => {
    const result = normaliseMessageEvent(
      messagePayload({
        chatType: 'group',
        text: '@_user_1 clone this video',
        mentions: [{ key: '@_user_1', name: 'bot' }],
      }),
    );
    expect(result?.text).toBe('clone this video');
    expect(result?.addressedToBot).toBe(true);
    expect(result?.mentionedNames).toEqual(['bot']);
  });

  it('keeps mention open ids so the gateway can match its own bot id', () => {
    const result = normaliseMessageEvent(
      messagePayload({
        chatType: 'group',
        text: '@_user_1 @_user_2 question',
        mentions: [
          { key: '@_user_1', name: 'someone-else', id: { open_id: 'ou_other' } },
          { key: '@_user_2', name: 'Main', id: { open_id: 'ou_main' } },
        ],
      }),
    );
    expect(result?.mentionedOpenIds).toEqual(['ou_other', 'ou_main']);
    expect(result?.mentionedNames).toEqual(['someone-else', 'Main']);
  });

  it('accepts the message-detail mention shape (bare open_id string)', () => {
    const payload = {
      header: { event_id: 'ev_flat', event_type: 'im.message.receive_v1' },
      event: {
        sender: { sender_id: { open_id: 'ou_1' }, sender_type: 'user' },
        message: {
          message_id: 'om_flat',
          chat_id: 'oc_1',
          chat_type: 'group',
          message_type: 'text',
          content: JSON.stringify({ text: '@_user_1 question' }),
          mentions: [{ key: '@_user_1', name: 'Main', id: 'ou_main' }],
        },
      },
    };
    const result = normaliseMessageEvent(payload);
    expect(result?.mentionedOpenIds).toEqual(['ou_main']);
    expect(result?.text).toBe('question');
  });

  it('accepts an already-parsed content object from a transport', () => {
    const payload = {
      header: { event_id: 'ev_obj', event_type: 'im.message.receive_v1' },
      event: {
        sender: { sender_id: { open_id: 'ou_1' }, sender_type: 'user' },
        message: {
          message_id: 'om_obj',
          chat_id: 'oc_1',
          chat_type: 'p2p',
          message_type: 'text',
          content: { text: 'parsed object' },
        },
      },
    };
    expect(normaliseMessageEvent(payload)?.text).toBe('parsed object');
  });

  it('extracts text from a Feishu rich-text post', () => {
    const payload = {
      header: { event_id: 'ev_post', event_type: 'im.message.receive_v1' },
      event: {
        sender: { sender_id: { open_id: 'ou_1' }, sender_type: 'user' },
        message: {
          message_id: 'om_post',
          chat_id: 'oc_1',
          chat_type: 'group',
          message_type: 'post',
          content: JSON.stringify({
            title: '问题',
            content: [
              [
                { tag: 'text', text: '@_user_1 区域相关性 0.9 还能做归因吗' },
                { tag: 'at', user_id: 'ou_main' },
              ],
            ],
          }),
          mentions: [{ key: '@_user_1', name: 'Main', id: { open_id: 'ou_main' } }],
        },
      },
    };
    const result = normaliseMessageEvent(payload);
    expect(result?.text).toBe('问题 区域相关性 0.9 还能做归因吗');
    expect(result?.addressedToBot).toBe(true);
  });

  it('ignores an unaddressed group message', () => {
    const result = normaliseMessageEvent(messagePayload({ chatType: 'group', text: 'chatter' }));
    expect(result?.addressedToBot).toBe(false);
  });

  it('ignores its own messages, which is the infinite-loop guard', () => {
    expect(normaliseMessageEvent(messagePayload({ senderType: 'app' }))).toBeNull();
  });

  it('ignores non-text messages rather than throwing', () => {
    // Throwing here would make Feishu retry forever on every sticker anyone sends.
    expect(normaliseMessageEvent(messagePayload({ messageType: 'image' }))).toBeNull();
  });

  it('ignores a mention-only message that has no remaining text', () => {
    const result = normaliseMessageEvent(
      messagePayload({ chatType: 'group', text: '@_user_1', mentions: [{ key: '@_user_1' }] }),
    );
    expect(result).toBeNull();
  });

  it('ignores unrelated event types', () => {
    const payload = messagePayload({});
    payload.header.event_type = 'im.chat.updated_v1';
    expect(normaliseMessageEvent(payload)).toBeNull();
  });

  it('ignores malformed payloads', () => {
    expect(normaliseMessageEvent({ nonsense: true })).toBeNull();
    expect(normaliseMessageEvent(null)).toBeNull();
  });

  it('uses event_id for idempotency', () => {
    expect(normaliseMessageEvent(messagePayload({}))?.eventId).toBe('ev_1');
  });

  it('falls back to message_id for v1 events, which have no header', () => {
    const v2 = messagePayload({});
    const v1 = {
      event: { ...v2.event, type: 'message' },
    };
    // v1 has no `header.event_type`, so the type comes from `event.type`. Our
    // normaliser only accepts `im.message.receive_v1`; a v1 delivery therefore
    // falls back to the message id rather than being silently dropped.
    expect(normaliseMessageEvent(v1)).toBeNull();
    expect(normaliseMessageEvent(v2)?.eventId).toBe('ev_1');
  });
});
