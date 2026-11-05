import { normaliseMessageEvent } from '@mas/feishu';
import { normalizeCardAction, type CardActionEvent } from '@larksuiteoapi/node-sdk';
import { DEFAULT_BRAND_ID } from '@mas/core';
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
import { isRecipeIntent } from './router.js';
import type { RecipeRunner } from './recipe-runner.js';
import {
  CardActionRegistry,
  actionIdFor,
  cardActionBody,
  createRecipeActionRegistry,
  isCardActionPayload,
  type CardActionResponse,
} from './card-action.js';
import type { TelemetryStats, TelemetryStoreLike } from './telemetry.js';

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
  /** Present once the recipe pipeline is wired (ticket 04). Absent = stub. */
  recipeRunner?: RecipeRunner;
  /** Optional Stage 3 evidence store. Absent = answers still work, nothing is recorded. */
  telemetry?: TelemetryStoreLike;
  /** Inbound card actions. Defaults to the recipe registry. */
  cardActions?: CardActionRegistry;
}

export class MainAgentHandler {
  private readonly dedupe = new TtlSet();
  private readonly queue: ChatQueue;
  private readonly sessions: SessionStoreLike;
  private readonly counts = { received: 0, ignored: 0, processed: 0, failed: 0 };
  private readonly telemetry: TelemetryStoreLike | undefined;
  private readonly cardActions: CardActionRegistry;
  private lastError: string | undefined;

  constructor(private readonly deps: HandlerDeps) {
    this.queue = new ChatQueue(deps.config.concurrency);
    this.sessions = deps.sessions ?? new SessionStore();
    this.telemetry = deps.telemetry;
    this.cardActions = deps.cardActions ?? createRecipeActionRegistry();
  }

  /**
   * HTTP webhook path. Messages return immediately and the queue does the work;
   * card callbacks return the toast/card body Feishu expects within three seconds.
   */
  async handlePayload(payload: unknown): Promise<unknown> {
    if (isCardActionPayload(payload)) {
      return this.handleCardAction(cardActionBody(payload), eventIdOf(payload));
    }
    const message = normaliseMessageEvent(payload);
    if (message === null) return { code: 0 };
    this.handleMessage(message);
    return { code: 0 };
  }

  /**
   * Long-connection card callback. The SDK sends the resolved value back to
   * Feishu as the callback response, so this must not be enqueued.
   */
  async handleWsCardAction(data: unknown): Promise<CardActionResponse | undefined> {
    if (!isCardActionPayload(data) && !looksLikeCardAction(data)) return undefined;
    return this.handleCardAction(cardActionBody(data), eventIdOf(data));
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

  private async handleCardAction(
    raw: unknown,
    eventId: string | undefined,
  ): Promise<CardActionResponse> {
    let event: CardActionEvent | null = null;
    try {
      event = normalizeCardAction(raw as Parameters<typeof normalizeCardAction>[0]);
    } catch (cause) {
      this.deps.logger.warn('card action normalisation failed', {
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
    if (event === null) {
      return { toast: { type: 'error', content: '无法识别这次操作。' } };
    }

    const value = isRecord(event.action.value) ? event.action.value : {};
    const actionId = actionIdFor(event, value);
    const recipeId = typeof value['recipe_id'] === 'string' ? value['recipe_id'] : undefined;
    const key = eventId ?? `card:${event.messageId}:${event.operator.openId}:${actionId}`;

    if (this.dedupe.seen(`card:${key}`)) {
      return { toast: { type: 'info', content: '这次操作已处理。' } };
    }

    let first = true;
    try {
      first =
        this.telemetry?.recordCardAction({
          eventId: key,
          actionId,
          ...(recipeId !== undefined ? { recipeId } : {}),
          chatId: event.chatId,
          messageId: event.messageId,
          operatorOpenId: event.operator.openId,
          payload: value,
        }) ?? true;
    } catch (cause) {
      this.deps.logger.warn('card action ledger write failed', {
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
    if (!first) {
      return { toast: { type: 'info', content: '这次操作已处理。' } };
    }

    const response = await this.cardActions.dispatch(event);
    this.record({
      kind: 'card_action',
      ...(eventId !== undefined ? { eventId } : {}),
      chatId: event.chatId,
      messageId: event.messageId,
      senderOpenId: event.operator.openId,
      actionId,
      ...(recipeId !== undefined ? { recipeId } : {}),
    });
    this.deps.logger.info('card action handled', {
      actionId,
      messageId: event.messageId,
      ...(recipeId !== undefined ? { recipeId } : {}),
    });
    return response;
  }

  private record(event: Parameters<TelemetryStoreLike['record']>[0]): void {
    try {
      this.telemetry?.record(event);
    } catch (cause) {
      this.deps.logger.warn('telemetry write failed', {
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
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
    telemetry?: TelemetryStats;
  } {
    return {
      ...this.counts,
      queue: this.queue.stats(),
      ...(this.lastError !== undefined ? { lastError: this.lastError } : {}),
      dedupeSize: this.dedupe.size,
      sessions: this.sessions.size,
      ...(this.telemetry !== undefined
        ? { telemetry: this.telemetry.stats(Date.now() - 86_400_000) }
        : {}),
    };
  }

  private async process(message: NormalisedMessage): Promise<void> {
    const startedAt = Date.now();
    const log = this.deps.logger.child({
      chatId: message.chatId,
      messageId: message.messageId,
      sender: message.senderOpenId,
    });

    const intent = isRecipeIntent(message.text) ? 'recipe' : 'consult';
    this.record({
      kind: 'message',
      eventId: message.eventId,
      chatId: message.chatId,
      messageId: message.messageId,
      senderOpenId: message.senderOpenId,
      questionText: message.text,
      intent,
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
      if (intent === 'recipe') {
        await this.processRecipe(message, log);
        this.counts.processed += 1;
        return;
      }

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

      this.record({
        kind: 'answer',
        eventId: message.eventId,
        chatId: message.chatId,
        messageId: message.messageId,
        senderOpenId: message.senderOpenId,
        ...(answer.nodeId !== undefined ? { nodeId: answer.nodeId } : {}),
        ...(answer.routeId !== undefined ? { routeId: answer.routeId } : {}),
        confidence: answer.confidence,
        outOfScope: answer.outOfScope,
      });

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
      this.record({
        kind: 'error',
        eventId: message.eventId,
        chatId: message.chatId,
        messageId: message.messageId,
        senderOpenId: message.senderOpenId,
        reason,
      });
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

  /**
   * Recipe branch. With a runner wired, submit to the async pipeline (ack now,
   * result later); without one the user gets an honest stub, not silence.
   */
  private async processRecipe(message: NormalisedMessage, log: Logger): Promise<void> {
    const runner = this.deps.recipeRunner;
    if (runner === undefined) {
      log.info('recipe intent routed to stub (no runner wired)', { chars: message.text.length });
      await this.safeReply(
        message,
        formatError('收到，recipe 拆解功能即将上线（当前版本暂未启用）。'),
        log,
      );
      return;
    }

    log.info('recipe intent submitted', { chars: message.text.length });
    await runner.submit({
      chatId: message.chatId,
      // Brand selection is ticket 04's wiring problem; the runner interface
      // takes it explicitly so multi-brand routing lands in one place.
      brandId: DEFAULT_BRAND_ID,
      prompt: message.text,
      actorId: message.senderOpenId,
      chatType: message.chatType,
      ack: async (text) => {
        await this.safeReply(message, formatError(text), log);
      },
      deliver: async (payloads) => {
        for (const p of payloads) {
          await this.deps.client.send(message.chatId, p);
        }
      },
    });
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

function eventIdOf(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;
  const header = payload['header'];
  if (isRecord(header) && typeof header['event_id'] === 'string' && header['event_id'].length > 0) {
    return header['event_id'];
  }
  const id = payload['event_id'];
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

function looksLikeCardAction(data: unknown): boolean {
  if (!isRecord(data)) return false;
  return isRecord(data['action']) && (isRecord(data['operator']) || isRecord(data['context']));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
