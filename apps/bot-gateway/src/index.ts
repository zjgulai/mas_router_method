/**
 * Main agent gateway.
 *
 * Two transports, one handler:
 *   - `FEISHU_EVENT_MODE=ws`   long connection (default; no public URL needed)
 *   - `FEISHU_EVENT_MODE=http` webhook at POST /events
 *
 * The gateway owns verification, idempotency, queueing, and delivery. The
 * consulting logic lives in `@mas/consult`, so the same agent can be reused by
 * the workbench or a CLI without reimplementation.
 */
import { MainConsultAgent } from '@mas/consult';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { LarkGatewayClient } from './feishu/client.js';
import type { BotIdentity } from './feishu/client.js';
import { MainAgentHandler } from './handler.js';
import { startHttpServer } from './http.js';
import { startWebSocket, type WebSocketHandle } from './ws.js';
import { createSessionStore } from './session.js';
import type { Server } from 'node:http';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel, { app: 'main-agent-gateway' });

  const client = new LarkGatewayClient(
    config,
    process.env['FEISHU_OPEN_BASE_URL'] ?? 'https://open.feishu.cn',
  );

  let identity: BotIdentity = {
    ...(config.botOpenId !== undefined ? { openId: config.botOpenId } : {}),
    name: config.botName,
  };

  try {
    const fetched = await client.getBotIdentity();
    identity = {
      ...(fetched.openId !== undefined ? { openId: fetched.openId } : {}),
      name: fetched.name ?? config.botName,
    };
    logger.info('bot identity resolved', { openId: identity.openId, name: identity.name });
  } catch (cause) {
    logger.warn('could not resolve bot identity; mention matching falls back to names', {
      error: cause instanceof Error ? cause.message : String(cause),
    });
  }

  const agent = MainConsultAgent.fromRepo({
    root: config.knowledgeRoot,
    maxChars: config.maxAnswerChars,
    ...(config.sourcesPath !== undefined ? { sourcesPath: config.sourcesPath } : {}),
  });

  const sessions = createSessionStore(config.sessionDbPath);
  const handler = new MainAgentHandler({
    config,
    client,
    agent,
    identity,
    logger,
    sessions,
  });

  logger.info('main agent ready', {
    mode: config.mode,
    appId: config.appId,
    knowledgeChunks: agent.corpus.chunks.length,
    groupMode: config.groupMode,
    messageFormat: config.messageFormat,
    llm: process.env['MAIN_AGENT_LLM'] ?? 'auto',
    sessionStore: sessions.constructor.name,
    sessionDbPath: config.sessionDbPath,
  });

  let ws: WebSocketHandle | undefined;
  let server: Server | undefined;

  if (config.mode === 'ws') {
    ws = await startWebSocket(handler, config, logger);
    logger.info('websocket status', { status: ws.status() });
  } else {
    server = await startHttpServer(handler, config, logger);
  }

  let stopping = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    logger.info('shutting down', { signal });
    ws?.close();
    if (server !== undefined) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
    }
    await handler.drain();
    sessions.close?.();
    logger.info('shutdown complete', { stats: handler.stats() });
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled rejection', {
      error: reason instanceof Error ? reason.message : String(reason),
    });
  });
  process.on('uncaughtException', (error) => {
    logger.error('uncaught exception', { error: error.message });
  });

  // Keep the process alive even if the transport is reconnecting and no server is
  // listening. A gateway that exits silently is worse than one that logs an error.
  await new Promise<void>(() => {});
}

void main().catch((cause: unknown) => {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      msg: 'fatal startup error',
      error: cause instanceof Error ? cause.message : String(cause),
    }),
  );
  process.exit(1);
});
