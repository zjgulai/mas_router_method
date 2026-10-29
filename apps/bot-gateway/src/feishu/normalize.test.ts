import { describe, expect, it } from 'vitest';
import type { MainAgentConfig } from '../config.js';
import { isAllowed, normaliseWsEvent, shouldRespond } from './normalize.js';

function config(overrides: Partial<MainAgentConfig> = {}): MainAgentConfig {
  return {
    appId: 'cli',
    appSecret: 'secret',
    mode: 'ws',
    port: 3001,
    verificationToken: undefined,
    encryptKey: undefined,
    groupMode: 'mention',
    allowedChatIds: new Set(),
    allowedOpenIds: new Set(),
    maxAnswerChars: 3400,
    concurrency: 1,
    logLevel: 'error',
    knowledgeRoot: process.cwd(),
    sourcesPath: undefined,
    botOpenId: undefined,
    botName: 'Main',
    messageFormat: 'text',
    ackAfterMs: 0,
    answerTimeoutMs: 1000,
    allowUnverifiedHttp: false,
    ...overrides,
  };
}

function wsEvent(mentions: { key: string; name: string; open_id: string }[]): unknown {
  return {
    event_id: 'ev_ws_1',
    sender: { sender_id: { open_id: 'ou_sender' }, sender_type: 'user' },
    message: {
      message_id: 'om_ws_1',
      chat_id: 'oc_1',
      chat_type: 'group',
      message_type: 'text',
      content: JSON.stringify({ text: '@_user_1 你好' }),
      mentions: mentions.map((mention) => ({
        key: mention.key,
        name: mention.name,
        id: { open_id: mention.open_id },
      })),
    },
  };
}

describe('websocket event normalisation', () => {
  it('maps the SDK event shape to a normalised message', () => {
    const message = normaliseWsEvent(
      wsEvent([{ key: '@_user_1', name: 'Main', open_id: 'ou_main' }]),
    );
    expect(message).toMatchObject({
      eventId: 'ev_ws_1',
      messageId: 'om_ws_1',
      chatId: 'oc_1',
      text: '你好',
      addressedToBot: true,
      mentionedOpenIds: ['ou_main'],
    });
  });

  it('accepts the real Feishu payload, including null user ids', () => {
    const message = normaliseWsEvent({
      schema: '2.0',
      event_id: 'ev_real',
      event_type: 'im.message.receive_v1',
      tenant_key: 'tenant',
      app_id: 'cli',
      sender: {
        sender_id: { open_id: 'ou_sender', union_id: 'on_sender', user_id: null },
        sender_type: 'user',
      },
      message: {
        message_id: 'om_real',
        chat_id: 'oc_1',
        chat_type: 'group',
        message_type: 'text',
        content: JSON.stringify({ text: '@_user_1 全栈 Agent Native builder 的开发流程是？' }),
        mentions: [
          {
            id: { open_id: 'ou_main', union_id: 'on_main', user_id: null },
            key: '@_user_1',
            mentioned_type: 'bot',
            name: 'Main',
          },
        ],
      },
    });

    expect(message).not.toBeNull();
    expect(message?.text).toBe('全栈 Agent Native builder 的开发流程是？');
    expect(message?.mentionedOpenIds).toEqual(['ou_main']);
    expect(shouldRespond(message!, { openId: 'ou_main', name: 'Main' }, 'mention')).toBe(true);
  });

  it('returns null for a malformed event', () => {
    expect(normaliseWsEvent({ nonsense: true })).toBeNull();
  });
});

describe('shouldRespond', () => {
  const message = normaliseWsEvent(
    wsEvent([{ key: '@_user_1', name: 'Main', open_id: 'ou_main' }]),
  );

  it('accepts a group message that mentions the bot open id', () => {
    expect(message).not.toBeNull();
    expect(shouldRespond(message!, { openId: 'ou_main', name: 'Main' }, 'mention')).toBe(true);
  });

  it('rejects a group message that mentions someone else', () => {
    const other = normaliseWsEvent(
      wsEvent([{ key: '@_user_1', name: 'Someone', open_id: 'ou_other' }]),
    );
    expect(shouldRespond(other!, { openId: 'ou_main', name: 'Main' }, 'mention')).toBe(false);
  });

  it('accepts an unaddressed group message only when groupMode is all', () => {
    const unaddressed = normaliseWsEvent({
      ...(wsEvent([]) as Record<string, unknown>),
      message: {
        ...(wsEvent([]) as { message: Record<string, unknown> }).message,
        mentions: [],
      },
    });
    expect(shouldRespond(unaddressed!, { openId: 'ou_main', name: 'Main' }, 'mention')).toBe(false);
    expect(shouldRespond(unaddressed!, { openId: 'ou_main', name: 'Main' }, 'all')).toBe(true);
  });

  it('falls back to name matching when the event omits open ids', () => {
    const named = normaliseWsEvent(wsEvent([{ key: '@_user_1', name: 'Main', open_id: '' }]));
    expect(named).not.toBeNull();
    expect(shouldRespond(named!, { openId: 'ou_main', name: 'Main' }, 'mention')).toBe(true);
  });

  it('does not silently accept everything when the identity is known', () => {
    const other = normaliseWsEvent(
      wsEvent([{ key: '@_user_1', name: 'Other', open_id: 'ou_other' }]),
    );
    expect(shouldRespond(other!, { openId: 'ou_main', name: 'Main' }, 'mention')).toBe(false);
  });
});

describe('isAllowed', () => {
  const message = normaliseWsEvent(wsEvent([]));

  it('allows everything when both lists are empty', () => {
    expect(isAllowed(message!, config())).toBe(true);
  });

  it('rejects a chat outside the allow-list', () => {
    expect(isAllowed(message!, config({ allowedChatIds: new Set(['oc_other']) }))).toBe(false);
  });

  it('rejects a sender outside the allow-list', () => {
    expect(isAllowed(message!, config({ allowedOpenIds: new Set(['ou_other']) }))).toBe(false);
  });
});
