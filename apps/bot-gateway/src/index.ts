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
import { MainConsultAgent, findRepoRoot } from '@mas/consult';
import { createRuntime, type VisionAnalyzer } from '@mas/core';
import { SqliteStore } from '@mas/core/adapters/sqlite';
import { createVodVisionAnalyzer } from '@mas/core/adapters/vod';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { LarkGatewayClient } from './feishu/client.js';
import type { BotIdentity } from './feishu/client.js';
import { MainAgentHandler } from './handler.js';
import { startHttpServer } from './http.js';
import { startWebSocket, type WebSocketHandle } from './ws.js';
import { createSessionStore } from './session.js';
import { createTelemetryStore } from './telemetry.js';
import { createRecipeActionRegistry } from './card-action.js';
import { RecipeRunner } from './recipe-runner.js';
import { createRecipeRuntime } from './recipe-runtime.js';
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

  let recipeStore: SqliteStore | undefined;
  let recipeRunner: RecipeRunner | undefined;
  if (config.recipeAgentEnabled) {
    const store = new SqliteStore(config.sessionDbPath);
    store.seedBrands();
    const vodKey = process.env['VOD_API_KEY'];
    const vision: VisionAnalyzer =
      vodKey === undefined || vodKey.length === 0
        ? {
            async analyze() {
              throw new Error('视频分析未配置（缺少 VOD_API_KEY）');
            },
          }
        : createVodVisionAnalyzer({ apiKey: vodKey });
    const runtime = createRuntime({
      brands: store,
      references: store,
      recipes: store,
      runs: store,
      vision,
      cwd: findRepoRoot(),
    });
    recipeStore = store;
    recipeRunner = new RecipeRunner({
      runtime: createRecipeRuntime({
        run: (request) => runtime.run(request),
        listRecipes: (brandId, limit) => store.listRecipes(brandId, limit),
      }),
      maxQueueDepth: 3,
    });
  }

  const telemetry = config.telemetryEnabled
    ? createTelemetryStore(config.telemetryDbPath)
    : undefined;
  const handler = new MainAgentHandler({
    config,
    client,
    agent,
    identity,
    logger,
    sessions,
    cardActions: createRecipeActionRegistry(),
    ...(recipeRunner !== undefined ? { recipeRunner } : {}),
    ...(telemetry !== undefined ? { telemetry } : {}),
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
    recipeAgent: config.recipeAgentEnabled ? 'enabled' : 'disabled',
    telemetryStore: telemetry?.constructor.name ?? 'disabled',
    telemetryDbPath: config.telemetryDbPath,
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
    recipeStore?.close();
    telemetry?.close?.();
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
