import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const base = {
  FEISHU_APP_ID: 'cli_test',
  FEISHU_APP_SECRET: 'secret',
};

describe('loadConfig', () => {
  it('defaults to long-connection mode and mention-only groups', () => {
    const config = loadConfig({ ...base });
    expect(config.mode).toBe('ws');
    expect(config.groupMode).toBe('mention');
    expect(config.port).toBe(3001);
    expect(config.maxAnswerChars).toBe(3400);
    expect(config.botName).toBe('Main');
    expect(config.verificationToken).toBeUndefined();
  });

  it('rejects a missing app id', () => {
    expect(() => loadConfig({ FEISHU_APP_SECRET: 'secret' })).toThrow(/FEISHU_APP_ID/);
  });

  it('rejects a missing app secret', () => {
    expect(() => loadConfig({ FEISHU_APP_ID: 'cli_test' })).toThrow(/FEISHU_APP_SECRET/);
  });

  it('requires a verification token in HTTP mode', () => {
    expect(() => loadConfig({ ...base, FEISHU_EVENT_MODE: 'http' })).toThrow(
      /FEISHU_VERIFICATION_TOKEN/,
    );
  });

  it('allows an explicitly unverified HTTP mode for local testing', () => {
    const config = loadConfig({
      ...base,
      FEISHU_EVENT_MODE: 'http',
      MAIN_AGENT_ALLOW_UNVERIFIED_HTTP: 'true',
    });
    expect(config.mode).toBe('http');
    expect(config.allowUnverifiedHttp).toBe(true);
  });

  it('parses allow-lists and numeric overrides', () => {
    const config = loadConfig({
      ...base,
      MAIN_AGENT_ALLOWED_CHAT_IDS: 'oc_1, oc_2',
      MAIN_AGENT_ALLOWED_OPEN_IDS: 'ou_1',
      MAIN_AGENT_CONCURRENCY: '4',
      MAIN_AGENT_MAX_ANSWER_CHARS: '1200',
    });
    expect([...config.allowedChatIds]).toEqual(['oc_1', 'oc_2']);
    expect([...config.allowedOpenIds]).toEqual(['ou_1']);
    expect(config.concurrency).toBe(4);
    expect(config.maxAnswerChars).toBe(1200);
  });
});
