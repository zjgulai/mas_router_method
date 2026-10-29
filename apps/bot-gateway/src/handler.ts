import { normaliseMessageEvent } from '@mas/feishu';
import type { ConsultAnswer, ConversationTurn } from '@mas/consult';
import type { MainAgentConfig } from './config.js';
import { TtlSet } from './dedupe.js';
import type { Logger } from './logger.js';
import { ChatQueue } from './queue.js';
import { SessionStore, sessionKeyFor, type SessionStoreLike } from './session.js';
import type { BotIdentity, FeishuGatewayClient, MessagePayload } from './feishu/client.js';
import { formatAck, formatAnswer, formatError } from './feishu/format.js';
import {
  isAllowed,
  shouldRespond,
  normaliseWsEvent,
  type NormalisedMessage,
} from './feishu/normalize.js';

export interface AnswerAgent {
  answer(question: string, options?: { history?: ConversationTurn[] }): Promise<ConsultAnswer>;
}

export interface HandlerDeps {
  config: MainAgentConfig;
  client: FeishuGatewayClient;
  agent: AnswerAgent;
  identity: BotIdentity;
  logger: Logger;
  sessions?: SessionStoreLike;
}

export class MainAgentHandler {
  private readonly dedupe = new TtlSet();
  private readonly queue: ChatQueue;
  private readonly sessions: SessionStoreLike;
  private readonly counts = { received: 0, ignored: 0, processed: 0, failed: 0 };
  private lastError: string | undefined;

  constructor(private readonly deps: HandlerDeps) {
    this.queue = new ChatQueue(deps.config.concurrency);
    this.sessions = deps.sessions ?? new SessionStore();
  }

  /** HTTP webhook path. Returns immediately; the queue does the work. */
  handlePayload(payload: unknown): { code: number } {
    const message = normaliseMessageEvent(payload);
    if (message === null) return { code: 0 };
    this.handleMessage(message);
    return { code: 0 };
  }

  /** Long-connection path. */
  handleWsEvent(data: unknown, eventId?: string): void {
    const message = normaliseWsEvent(data, eventId);
    if (message === null) {
      this.deps.logger.debug('ws event normalised to null', { eventId });
      return;
    }
    this.deps.logger.debug('ws event normalised', {
      eventId: message.eventId,
      messageId: message.messageId,
      chatType: message.chatType,
      text: message.text,
      addressedToBot: message.addressedToBot,
      mentionedOpenIds: message.mentionedOpenIds,
      mentionedNames: message.mentionedNames,
    });
    this.handleMessage(message);
  }

  handleMessage(message: NormalisedMessage): void {
    this.counts.received += 1;

    if (
      this.dedupe.seen(`event:${message.eventId}`) ||
      this.dedupe.seen(`msg:${message.messageId}`)
    ) {
      this.counts.ignored += 1;
      this.deps.logger.debug('duplicate event ignored', { eventId: message.eventId });
      return;
    }

    if (!isAllowed(message, this.deps.config)) {
      this.counts.ignored += 1;
      this.deps.logger.debug('message outside allow-list', {
        chatId: message.chatId,
        sender: message.senderOpenId,
      });
      return;
    }

    if (!shouldRespond(message, this.deps.identity, this.deps.config.groupMode)) {
      this.counts.ignored += 1;
      this.deps.logger.debug('message not addressed to this bot', {
        chatType: message.chatType,
        groupMode: this.deps.config.groupMode,
        addressedToBot: message.addressedToBot,
        mentionedOpenIds: message.mentionedOpenIds,
        mentionedNames: message.mentionedNames,
        botOpenId: this.deps.identity.openId,
        botName: this.deps.identity.name,
      });
      return;
    }

    const task = this.queue.enqueue(message.chatId, () => this.process(message));
    void task.catch((cause: unknown) => {
      this.counts.failed += 1;
      this.lastError = cause instanceof Error ? cause.message : String(cause);
      this.deps.logger.error('queue task failed', {
        messageId: message.messageId,
        error: this.lastError,
      });
    });
  }

  async drain(): Promise<void> {
    await this.queue.drain();
  }

  stats(): {
    received: number;
    ignored: number;
    processed: number;
    failed: number;
    queue: { active: number; pending: number; chats: number };
    lastError?: string;
    dedupeSize: number;
    sessions: number;
  } {
    return {
      ...this.counts,
      queue: this.queue.stats(),
      ...(this.lastError !== undefined ? { lastError: this.lastError } : {}),
      dedupeSize: this.dedupe.size,
      sessions: this.sessions.size,
    };
  }

  private async process(message: NormalisedMessage): Promise<void> {
    const startedAt = Date.now();
    const log = this.deps.logger.child({
      chatId: message.chatId,
      messageId: message.messageId,
      sender: message.senderOpenId,
    });

    let ackTimer: ReturnType<typeof setTimeout> | undefined;
    if (this.deps.config.ackAfterMs > 0) {
      ackTimer = setTimeout(() => {
        void this.safeReply(message, formatAck(), log).catch((cause: unknown) => {
          log.warn('ack delivery failed', {
            error: cause instanceof Error ? cause.message : String(cause),
          });
        });
      }, this.deps.config.ackAfterMs);
      ackTimer.unref?.();
    }

    try {
      const sessionKey = sessionKeyFor(message);
      const history = sessionKey === undefined ? [] : this.sessions.get(sessionKey);
      log.info('question received', {
        chars: message.text.length,
        chatType: message.chatType,
        historyTurns: history.length,
      });
      const answer = await withTimeout(
        this.deps.agent.answer(message.text, { history }),
        this.deps.config.answerTimeoutMs,
      );
      if (ackTimer !== undefined) clearTimeout(ackTimer);

      const payloads = formatAnswer(answer.text, {
        format: this.deps.config.messageFormat,
        maxChars: this.deps.config.maxAnswerChars,
      });
      for (const payload of payloads) {
        await this.safeReply(message, payload, log);
      }

      if (sessionKey !== undefined) {
        this.sessions.append(sessionKey, { role: 'user', text: message.text });
        this.sessions.append(sessionKey, { role: 'assistant', text: answer.text });
      }

      this.counts.processed += 1;
      log.info('answer delivered', {
        nodeId: answer.nodeId,
        routeId: answer.routeId,
        confidence: answer.confidence,
        outOfScope: answer.outOfScope,
        parts: payloads.length,
        ms: Date.now() - startedAt,
      });
    } catch (cause) {
      if (ackTimer !== undefined) clearTimeout(ackTimer);
      this.counts.failed += 1;
      const reason = cause instanceof Error ? cause.message : String(cause);
      this.lastError = reason;
      log.error('answer failed', { error: reason, ms: Date.now() - startedAt });
      await this.safeReply(
        message,
        formatError(
          `这次没答上来：${shorten(reason, 160)}\n请稍后重试，或换一种问法（例如直接描述你卡住的层面和已经跑过的检查）。`,
        ),
        log,
      );
    }
  }

  private async safeReply(
    message: NormalisedMessage,
    payload: MessagePayload,
    log: Logger,
  ): Promise<void> {
    try {
      await this.deps.client.reply(message.messageId, payload);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      log.warn('reply failed; trying chat send', { error: reason });
      try {
        await this.deps.client.send(message.chatId, payload);
      } catch (second) {
        const secondReason = second instanceof Error ? second.message : String(second);
        log.error('delivery failed', { error: secondReason });
        throw second;
      }
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`answer timed out after ${ms}ms`));
    }, ms);
    timer.unref?.();

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (cause: unknown) => {
        clearTimeout(timer);
        reject(cause);
      },
    );
  });
}

function shorten(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
