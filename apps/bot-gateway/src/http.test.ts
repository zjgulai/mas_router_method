import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { MainAgentConfig } from './config.js';
import { createLogger } from './logger.js';
import { createHttpServer } from './http.js';
import type { MainAgentHandler } from './handler.js';

function config(overrides: Partial<MainAgentConfig> = {}): MainAgentConfig {
  return {
    appId: 'cli_test',
    appSecret: 'secret',
    mode: 'http',
    port: 0,
    verificationToken: 'verify_me',
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
    sessionDbPath: ':memory:',
    ...overrides,
  };
}

describe('http gateway', () => {
  let server: Server;
  let baseUrl: string;
  const handled: unknown[] = [];

  const handler = {
    handlePayload(payload: unknown) {
      handled.push(payload);
      return { code: 0 };
    },
    stats() {
      return { received: handled.length, ignored: 0, processed: 0, failed: 0 };
    },
  } as unknown as MainAgentHandler;

  beforeAll(async () => {
    server = createHttpServer(handler, config(), createLogger('error'));
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('answers the URL verification challenge', async () => {
    const response = await fetch(`${baseUrl}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'url_verification', token: 'verify_me', challenge: 'abc123' }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ challenge: 'abc123' });
  });

  it('rejects a body with the wrong verification token', async () => {
    const response = await fetch(`${baseUrl}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'url_verification', token: 'wrong', challenge: 'abc' }),
    });
    expect(response.status).toBe(400);
  });

  it('accepts a valid event and returns immediately', async () => {
    const response = await fetch(`${baseUrl}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: 'verify_me',
        header: { event_id: 'ev_1', event_type: 'im.message.receive_v1' },
        event: {
          sender: { sender_id: { open_id: 'ou_1' }, sender_type: 'user' },
          message: {
            message_id: 'om_1',
            chat_id: 'oc_1',
            chat_type: 'group',
            message_type: 'text',
            content: JSON.stringify({ text: '@_user_1 你好' }),
            mentions: [{ key: '@_user_1', name: 'Main', id: { open_id: 'ou_main' } }],
          },
        },
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ code: 0 });
    expect(handled).toHaveLength(1);
  });

  it('serves a health endpoint', async () => {
    const response = await fetch(`${baseUrl}/healthz`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, mode: 'http' });
  });

  it('returns 404 for an unknown path', async () => {
    const response = await fetch(`${baseUrl}/nope`);
    expect(response.status).toBe(404);
  });
});
