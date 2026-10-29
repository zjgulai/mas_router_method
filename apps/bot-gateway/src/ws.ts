import * as lark from '@larksuiteoapi/node-sdk';
import type { MainAgentConfig, LogLevel } from './config.js';
import type { Logger } from './logger.js';
import type { MainAgentHandler } from './handler.js';

export interface WebSocketHandle {
  close(): void;
  status(): lark.WSConnectionStatus;
}

/**
 * Feishu long-connection mode.
 *
 * This is the local-development default because it needs no public URL. The SDK
 * owns authentication and transport encryption; this module owns only the event
 * key and the "return within three seconds" rule. The handler enqueues and
 * returns, so a slow answer cannot trigger Feishu's retry storm.
 */
export async function startWebSocket(
  handler: MainAgentHandler,
  config: MainAgentConfig,
  logger: Logger,
): Promise<WebSocketHandle> {
  let readyResolve: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    readyResolve = resolve;
  });

  const dispatcher = new lark.EventDispatcher({}).register({
    'im.message.receive_v1': (data: unknown) => {
      const record =
        typeof data === 'object' && data !== null
          ? (data as {
              event_id?: unknown;
              event_type?: unknown;
              message?: { message_id?: unknown; chat_type?: unknown; message_type?: unknown };
            })
          : {};
      const eventId = typeof record.event_id === 'string' ? record.event_id : undefined;
      logger.debug('ws raw event', {
        eventId,
        data: safeStringify(data).slice(0, 4000),
      });
      logger.info('ws event received', {
        eventId,
        eventType: typeof record.event_type === 'string' ? record.event_type : undefined,
        messageId: record.message?.message_id,
        chatType: record.message?.chat_type,
        messageType: record.message?.message_type,
      });
      handler.handleWsEvent(data, eventId);
      // Returning synchronously is deliberate: the SDK must answer Feishu now.
      return undefined;
    },
  });

  const client = new lark.WSClient({
    appId: config.appId,
    appSecret: config.appSecret,
    loggerLevel: toSdkLogLevel(config.logLevel),
    source: 'mas-main-agent',
    onReady: () => {
      logger.info('websocket connected');
      readyResolve?.();
    },
    onError: (error) => {
      logger.error('websocket error', { error: error.message });
    },
    onReconnecting: () => {
      logger.warn('websocket reconnecting');
    },
    onReconnected: () => {
      logger.info('websocket reconnected');
    },
  });

  void client.start({ eventDispatcher: dispatcher }).catch((cause: unknown) => {
    logger.error('websocket start failed', {
      error: cause instanceof Error ? cause.message : String(cause),
    });
  });

  // Do not block startup forever on a tenant that has not enabled long-connection
  // mode. The client keeps retrying; the process stays alive and the HTTP health
  // endpoint still works if the operator switches modes.
  await Promise.race([
    ready,
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 15_000);
      timer.unref?.();
    }),
  ]);

  return {
    close: () => client.close(),
    status: () => client.getConnectionStatus(),
  };
}

function toSdkLogLevel(level: LogLevel): lark.LoggerLevel {
  switch (level) {
    case 'debug':
      return lark.LoggerLevel.debug;
    case 'warn':
      return lark.LoggerLevel.warn;
    case 'error':
      return lark.LoggerLevel.error;
    default:
      return lark.LoggerLevel.info;
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
