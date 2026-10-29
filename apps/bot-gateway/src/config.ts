import { findRepoRoot } from '@mas/consult';

export type EventMode = 'ws' | 'http';
export type GroupMode = 'mention' | 'all';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface MainAgentConfig {
  appId: string;
  appSecret: string;
  mode: EventMode;
  port: number;
  verificationToken: string | undefined;
  encryptKey: string | undefined;
  /** `mention`: only answer group messages that mention the bot. */
  groupMode: GroupMode;
  allowedChatIds: ReadonlySet<string>;
  allowedOpenIds: ReadonlySet<string>;
  maxAnswerChars: number;
  concurrency: number;
  logLevel: LogLevel;
  knowledgeRoot: string;
  sourcesPath: string | undefined;
  /** Filled from `/bot/v3/info` at startup when possible. */
  botOpenId: string | undefined;
  botName: string;
  /** `text` is the safe default; `card` renders markdown in a Feishu card. */
  messageFormat: 'text' | 'card';
  /** Reply with a short acknowledgement if generation takes longer than this. */
  ackAfterMs: number;
  /** Hard timeout for one answer. */
  answerTimeoutMs: number;
  /** HTTP mode only: allow an empty verification token (local testing). */
  allowUnverifiedHttp: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): MainAgentConfig {
  const appId = env['FEISHU_APP_ID'] ?? env['MAIN_APP_ID'];
  const appSecret = env['FEISHU_APP_SECRET'] ?? env['MAIN_APP_SECRET'];
  if (appId === undefined || appId.length === 0) {
    throw new Error('FEISHU_APP_ID is required (the Main app id, e.g. cli_xxx).');
  }
  if (appSecret === undefined || appSecret.length === 0) {
    throw new Error('FEISHU_APP_SECRET is required.');
  }

  const mode = parseMode(env['FEISHU_EVENT_MODE'] ?? env['MAIN_AGENT_MODE'] ?? 'ws');
  const verificationToken = emptyToUndefined(env['FEISHU_VERIFICATION_TOKEN']);
  const encryptKey = emptyToUndefined(env['FEISHU_ENCRYPT_KEY']);
  const allowUnverifiedHttp = env['MAIN_AGENT_ALLOW_UNVERIFIED_HTTP'] === 'true';

  if (mode === 'http' && verificationToken === undefined && !allowUnverifiedHttp) {
    throw new Error(
      'HTTP mode requires FEISHU_VERIFICATION_TOKEN. Set MAIN_AGENT_ALLOW_UNVERIFIED_HTTP=true only for local testing.',
    );
  }

  return {
    appId,
    appSecret,
    mode,
    port: positiveInt(env['BOT_GATEWAY_PORT'], 3001),
    verificationToken,
    encryptKey,
    groupMode: env['MAIN_AGENT_GROUP_MODE'] === 'all' ? 'all' : 'mention',
    allowedChatIds: csvSet(env['MAIN_AGENT_ALLOWED_CHAT_IDS']),
    allowedOpenIds: csvSet(env['MAIN_AGENT_ALLOWED_OPEN_IDS']),
    maxAnswerChars: positiveInt(env['MAIN_AGENT_MAX_ANSWER_CHARS'], 3400),
    concurrency: positiveInt(env['MAIN_AGENT_CONCURRENCY'], 2),
    logLevel: parseLogLevel(env['MAIN_AGENT_LOG_LEVEL'] ?? 'info'),
    knowledgeRoot: env['MAIN_AGENT_KNOWLEDGE_ROOT'] ?? findRepoRoot(),
    sourcesPath: emptyToUndefined(env['MAIN_AGENT_KNOWLEDGE_SOURCES']),
    botOpenId: emptyToUndefined(env['FEISHU_BOT_OPEN_ID']),
    botName: env['FEISHU_BOT_NAME'] ?? 'Main',
    messageFormat: env['MAIN_AGENT_MESSAGE_FORMAT'] === 'card' ? 'card' : 'text',
    ackAfterMs: nonNegativeInt(env['MAIN_AGENT_ACK_AFTER_MS'], 4000),
    answerTimeoutMs: positiveInt(env['MAIN_AGENT_ANSWER_TIMEOUT_MS'], 90_000),
    allowUnverifiedHttp,
  };
}

function parseMode(value: string): EventMode {
  if (value === 'http' || value === 'webhook') return 'http';
  return 'ws';
}

function parseLogLevel(value: string): LogLevel {
  if (value === 'debug' || value === 'warn' || value === 'error') return value;
  return 'info';
}

function emptyToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value.length === 0 ? undefined : value;
}

function positiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function csvSet(value: string | undefined): ReadonlySet<string> {
  if (value === undefined || value.trim().length === 0) return new Set<string>();
  return new Set(
    value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );
}
