import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { FeishuVerificationError, parseFeishuBody, urlVerificationChallenge } from '@mas/feishu';
import type { MainAgentConfig } from './config.js';
import type { Logger } from './logger.js';
import type { MainAgentHandler } from './handler.js';

const MAX_BODY_BYTES = 1_000_000;

export interface HttpServerOptions {
  startedAt?: number;
}

export function createHttpServer(
  handler: MainAgentHandler,
  config: MainAgentConfig,
  logger: Logger,
  options: HttpServerOptions = {},
): Server {
  const startedAt = options.startedAt ?? Date.now();

  const server = createServer((req, res) => {
    void route(req, res).catch((cause: unknown) => {
      logger.error('http handler threw', {
        error: cause instanceof Error ? cause.message : String(cause),
      });
      if (!res.headersSent) json(res, 500, { code: 500, msg: 'internal error' });
      else res.end();
    });
  });

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/healthz') {
      json(res, 200, {
        ok: true,
        mode: config.mode,
        appId: config.appId,
        uptimeSec: Math.round((Date.now() - startedAt) / 1000),
        ...handler.stats(),
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/readyz') {
      json(res, 200, { ready: true, mode: config.mode });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Main agent gateway. POST /events, GET /healthz.\n');
      return;
    }

    if (req.method !== 'POST' || url.pathname !== '/events') {
      json(res, 404, { code: 404, msg: 'not found' });
      return;
    }

    let raw: string;
    try {
      raw = await readBody(req, MAX_BODY_BYTES);
    } catch (cause) {
      json(res, 413, {
        code: 413,
        msg: cause instanceof Error ? cause.message : 'body too large',
      });
      return;
    }

    let payload: Record<string, unknown>;
    try {
      if (config.verificationToken === undefined) {
        if (!config.allowUnverifiedHttp) {
          throw new FeishuVerificationError('HTTP mode has no verification token configured.');
        }
        payload = JSON.parse(raw) as Record<string, unknown>;
      } else {
        payload = parseFeishuBody(raw, {
          verificationToken: config.verificationToken,
          ...(config.encryptKey !== undefined ? { encryptKey: config.encryptKey } : {}),
        });
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      logger.warn('event verification failed', { error: message });
      json(res, 400, { code: 400, msg: message });
      return;
    }

    const challenge = urlVerificationChallenge(payload);
    if (challenge !== null) {
      logger.info('url verification challenge answered');
      json(res, 200, { challenge });
      return;
    }

    // Return immediately. Feishu retries when the handler exceeds its timeout, and
    // the agent routinely takes longer than that.
    const result = handler.handlePayload(payload);
    json(res, 200, result);
  }

  return server;
}

export function startHttpServer(
  handler: MainAgentHandler,
  config: MainAgentConfig,
  logger: Logger,
): Promise<Server> {
  const server = createHttpServer(handler, config, logger);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, () => {
      server.off('error', reject);
      logger.info('http gateway listening', { port: config.port, path: '/events' });
      resolve(server);
    });
  });
}

async function readBody(req: IncomingMessage, limit: number): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new Error('request body too large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
  });
  res.end(text);
}
