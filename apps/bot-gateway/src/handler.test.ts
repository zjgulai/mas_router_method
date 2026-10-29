import { describe, expect, it } from 'vitest';
import type { ConsultAnswer } from '@mas/consult';
import type { MainAgentConfig } from './config.js';
import { createLogger } from './logger.js';
import { MainAgentHandler, type AnswerAgent } from './handler.js';
import type { BotIdentity, FeishuGatewayClient, MessagePayload } from './feishu/client.js';

function testConfig(overrides: Partial<MainAgentConfig> = {}): MainAgentConfig {
  return {
    appId: 'cli_test',
    appSecret: 'secret',
    mode: 'ws',
    port: 3001,
    verificationToken: undefined,
    encryptKey: undefined,
    groupMode: 'mention',
    allowedChatIds: new Set(),
    allowedOpenIds: new Set(),
    maxAnswerChars: 3400,
    concurrency: 2,
    logLevel: 'error',
    knowledgeRoot: process.cwd(),
    sourcesPath: undefined,
    botOpenId: 'ou_main',
    botName: 'Main',
    messageFormat: 'text',
    ackAfterMs: 0,
    answerTimeoutMs: 1000,
    allowUnverifiedHttp: false,
    ...overrides,
  };
}

class FakeClient implements FeishuGatewayClient {
  readonly replies: { messageId: string; payload: MessagePayload }[] = [];
  readonly sends: { chatId: string; payload: MessagePayload }[] = [];
  replyFails = false;

  async getBotIdentity(): Promise<BotIdentity> {
    return { openId: 'ou_main', name: 'Main' };
  }

  async reply(messageId: string, payload: MessagePayload): Promise<void> {
    if (this.replyFails) throw new Error('reply denied');
    this.replies.push({ messageId, payload });
  }

  async send(chatId: string, payload: MessagePayload): Promise<void> {
    this.sends.push({ chatId, payload });
  }
}

class FakeAgent implements AnswerAgent {
  readonly questions: string[] = [];
  constructor(
    private readonly impl: (question: string) => Promise<ConsultAnswer> | ConsultAnswer,
  ) {}

  async answer(question: string): Promise<ConsultAnswer> {
    this.questions.push(question);
    return this.impl(question);
  }
}

function answer(text = '测试答案', overrides: Partial<ConsultAnswer> = {}): ConsultAnswer {
  return {
    text,
    nodeId: 'analysis-identification',
    confidence: 'high',
    sources: [{ path: 'docs/product/data-product-design.md' }],
    retrieved: [],
    steps: [],
    outOfScope: false,
    ...overrides,
  };
}

function payload(
  options: {
    eventId?: string;
    messageId?: string;
    chatType?: 'p2p' | 'group';
    text?: string;
    mentions?: { key: string; name?: string; id?: { open_id?: string } }[];
  } = {},
): unknown {
  return {
    header: {
      event_id: options.eventId ?? 'ev_1',
      event_type: 'im.message.receive_v1',
    },
    event: {
      sender: { sender_id: { open_id: 'ou_sender' }, sender_type: 'user' },
      message: {
        message_id: options.messageId ?? 'om_1',
        chat_id: 'oc_1',
        chat_type: options.chatType ?? 'group',
        message_type: 'text',
        content: JSON.stringify({ text: options.text ?? '@_user_1 区域相关性 0.9 还能做归因吗' }),
        ...(options.mentions !== undefined
          ? { mentions: options.mentions }
          : {
              mentions: [{ key: '@_user_1', name: 'Main', id: { open_id: 'ou_main' } }],
            }),
      },
    },
  };
}

function setup(
  options: {
    config?: Partial<MainAgentConfig>;
    agent?: FakeAgent;
    client?: FakeClient;
  } = {},
) {
  const client = options.client ?? new FakeClient();
  const agent = options.agent ?? new FakeAgent(() => answer());
  const handler = new MainAgentHandler({
    config: testConfig(options.config),
    client,
    agent,
    identity: { openId: 'ou_main', name: 'Main' },
    logger: createLogger('error'),
  });
  return { client, agent, handler };
}

describe('MainAgentHandler', () => {
  it('answers a group message that mentions the bot', async () => {
    const { client, agent, handler } = setup();
    handler.handlePayload(payload());
    await handler.drain();

    expect(agent.questions).toEqual(['区域相关性 0.9 还能做归因吗']);
    expect(client.replies).toHaveLength(1);
    expect(client.replies[0]?.messageId).toBe('om_1');
    expect(JSON.parse(client.replies[0]?.payload.content ?? '{}')).toMatchObject({
      text: '测试答案',
    });
  });

  it('ignores a group message that does not mention the bot', async () => {
    const { client, handler } = setup();
    handler.handlePayload(payload({ text: '随便聊聊', mentions: [] }));
    await handler.drain();
    expect(client.replies).toHaveLength(0);
  });

  it('ignores a mention of someone else', async () => {
    const { client, handler } = setup();
    handler.handlePayload(
      payload({
        text: '@_user_1 你怎么看',
        mentions: [{ key: '@_user_1', name: 'Someone Else', id: { open_id: 'ou_other' } }],
      }),
    );
    await handler.drain();
    expect(client.replies).toHaveLength(0);
  });

  it('answers every direct message', async () => {
    const { client, handler } = setup();
    handler.handlePayload(payload({ chatType: 'p2p', mentions: [] }));
    await handler.drain();
    expect(client.replies).toHaveLength(1);
  });

  it('deduplicates a Feishu retry by event id', async () => {
    const { client, agent, handler } = setup();
    handler.handlePayload(payload({ eventId: 'ev_same' }));
    handler.handlePayload(payload({ eventId: 'ev_same', messageId: 'om_2' }));
    await handler.drain();
    expect(agent.questions).toHaveLength(1);
    expect(client.replies).toHaveLength(1);
  });

  it('honours the chat allow-list', async () => {
    const { client, handler } = setup({ config: { allowedChatIds: new Set(['oc_other']) } });
    handler.handlePayload(payload());
    await handler.drain();
    expect(client.replies).toHaveLength(0);
  });

  it('replies with a useful error when the agent fails', async () => {
    const agent = new FakeAgent(() => {
      throw new Error('model unavailable');
    });
    const { client, handler } = setup({ agent });
    handler.handlePayload(payload());
    await handler.drain();

    expect(client.replies).toHaveLength(1);
    const content = JSON.parse(client.replies[0]?.payload.content ?? '{}') as { text?: string };
    expect(content.text).toContain('这次没答上来');
    expect(content.text).toContain('model unavailable');
  });

  it('falls back to sending to the chat when a reply is denied', async () => {
    const client = new FakeClient();
    client.replyFails = true;
    const { handler } = setup({ client });
    handler.handlePayload(payload());
    await handler.drain();
    expect(client.sends).toHaveLength(1);
    expect(client.sends[0]?.chatId).toBe('oc_1');
  });

  it('splits an answer that exceeds the message budget', async () => {
    const long = '段'.repeat(2500);
    const agent = new FakeAgent(() => answer(long));
    const { client, handler } = setup({ agent, config: { maxAnswerChars: 1000 } });
    handler.handlePayload(payload());
    await handler.drain();
    expect(client.replies.length).toBeGreaterThanOrEqual(3);
    expect(JSON.parse(client.replies[0]?.payload.content ?? '{}')).toMatchObject({
      text: expect.stringContaining('（1/'),
    });
  });

  it('answers a websocket event whose mention id is a bare open_id string', async () => {
    const { client, agent, handler } = setup();
    handler.handleWsEvent({
      event_id: 'ev_ws_flat',
      event_type: 'im.message.receive_v1',
      sender: { sender_id: { open_id: 'ou_sender' }, sender_type: 'user' },
      message: {
        message_id: 'om_ws_flat',
        chat_id: 'oc_1',
        chat_type: 'group',
        message_type: 'text',
        content: { text: '@_user_1 全栈 Agent Native builder 的开发流程是？' },
        mentions: [{ key: '@_user_1', name: 'Main', id: 'ou_main' }],
      },
    });
    await handler.drain();

    expect(agent.questions).toEqual(['全栈 Agent Native builder 的开发流程是？']);
    expect(client.replies).toHaveLength(1);
  });

  it('reports stats for health checks', async () => {
    const { handler } = setup();
    handler.handlePayload(payload());
    await handler.drain();
    expect(handler.stats()).toMatchObject({ received: 1, processed: 1, failed: 0 });
  });
});
