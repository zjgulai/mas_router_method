import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * The evidence layer for Stage 3.
 *
 * The PMO's four-stage rubric asks for questions asked at least ten times a
 * week, then an SOP distilled from them. That is impossible to answer from
 * logs that only exist while the process runs, so every inbound question and
 * every button click is written to SQLite at the moment it happens.
 *
 * Question text is normalised before it is stored: case and whitespace are not
 * part of "the same question", and grouping without that step turns one
 * question into five rows.
 */

export type TelemetryKind = 'message' | 'answer' | 'card_action' | 'error';

export interface TelemetryEvent {
  kind: TelemetryKind;
  eventId?: string;
  chatId?: string;
  messageId?: string;
  senderOpenId?: string;
  questionText?: string;
  intent?: 'consult' | 'recipe';
  nodeId?: string;
  routeId?: string;
  confidence?: string;
  outOfScope?: boolean;
  actionId?: string;
  recipeId?: string;
  reason?: string;
  createdAt?: number;
}

export interface CardActionRecord {
  eventId: string;
  actionId: string;
  recipeId?: string;
  chatId?: string;
  messageId?: string;
  operatorOpenId?: string;
  payload?: unknown;
  createdAt?: number;
}

export interface QuestionCount {
  questionHash: string;
  text: string;
  count: number;
  lastSeen: number;
}

export interface TelemetryStats {
  messages: number;
  answers: number;
  cardActions: number;
  errors: number;
  distinctChats: number;
  distinctQuestions: number;
}

export interface TelemetryStoreLike {
  record(event: TelemetryEvent): void;
  /** False when this event id already produced a row. */
  recordCardAction(action: CardActionRecord): boolean;
  topQuestions(sinceMs: number, limit?: number): QuestionCount[];
  stats(sinceMs: number): TelemetryStats;
  close?(): void;
}

export function normaliseQuestion(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function questionHash(text: string): string {
  return createHash('sha256').update(normaliseQuestion(text)).digest('hex').slice(0, 16);
}

export class SqliteTelemetryStore implements TelemetryStoreLike {
  private readonly db: DatabaseSync;

  constructor(path = ':memory:') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        event_id TEXT,
        chat_id TEXT,
        message_id TEXT,
        sender_open_id TEXT,
        question_hash TEXT,
        question_text TEXT,
        intent TEXT,
        node_id TEXT,
        route_id TEXT,
        confidence TEXT,
        out_of_scope INTEGER,
        action_id TEXT,
        recipe_id TEXT,
        reason TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_kind_created ON events(kind, created_at);
      CREATE INDEX IF NOT EXISTS idx_events_question ON events(question_hash, created_at);
      CREATE TABLE IF NOT EXISTS card_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        action_id TEXT NOT NULL,
        recipe_id TEXT,
        chat_id TEXT,
        message_id TEXT,
        operator_open_id TEXT,
        payload_json TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_card_actions_created ON card_actions(created_at);
    `);
  }

  record(event: TelemetryEvent): void {
    const createdAt = event.createdAt ?? Date.now();
    this.db
      .prepare(
        `INSERT INTO events (
           kind, event_id, chat_id, message_id, sender_open_id,
           question_hash, question_text, intent, node_id, route_id,
           confidence, out_of_scope, action_id, recipe_id, reason, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.kind,
        event.eventId ?? null,
        event.chatId ?? null,
        event.messageId ?? null,
        event.senderOpenId ?? null,
        event.questionText === undefined ? null : questionHash(event.questionText),
        event.questionText === undefined
          ? null
          : normaliseQuestion(event.questionText).slice(0, 500),
        event.intent ?? null,
        event.nodeId ?? null,
        event.routeId ?? null,
        event.confidence ?? null,
        event.outOfScope === undefined ? null : event.outOfScope ? 1 : 0,
        event.actionId ?? null,
        event.recipeId ?? null,
        event.reason ?? null,
        createdAt,
      );
  }

  recordCardAction(action: CardActionRecord): boolean {
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO card_actions (
           event_id, action_id, recipe_id, chat_id, message_id,
           operator_open_id, payload_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        action.eventId,
        action.actionId,
        action.recipeId ?? null,
        action.chatId ?? null,
        action.messageId ?? null,
        action.operatorOpenId ?? null,
        safeJson(action.payload),
        action.createdAt ?? Date.now(),
      );
    return Number(result.changes) > 0;
  }

  topQuestions(sinceMs: number, limit = 20): QuestionCount[] {
    const rows = this.db
      .prepare(
        `SELECT question_hash, MIN(question_text) AS text,
                COUNT(*) AS count, MAX(created_at) AS last_seen
         FROM events
         WHERE kind = 'message' AND question_hash IS NOT NULL AND created_at >= ?
         GROUP BY question_hash
         ORDER BY count DESC, last_seen DESC
         LIMIT ?`,
      )
      .all(sinceMs, limit) as Record<string, unknown>[];

    return rows.map((row) => ({
      questionHash: typeof row['question_hash'] === 'string' ? row['question_hash'] : '',
      text: typeof row['text'] === 'string' ? row['text'] : '',
      count: toNumber(row['count']),
      lastSeen: toNumber(row['last_seen']),
    }));
  }

  stats(sinceMs: number): TelemetryStats {
    const row = this.db
      .prepare(
        `SELECT
           SUM(CASE WHEN kind = 'message' THEN 1 ELSE 0 END) AS messages,
           SUM(CASE WHEN kind = 'answer' THEN 1 ELSE 0 END) AS answers,
           SUM(CASE WHEN kind = 'error' THEN 1 ELSE 0 END) AS errors,
           COUNT(DISTINCT chat_id) AS distinct_chats,
           COUNT(DISTINCT question_hash) AS distinct_questions
         FROM events WHERE created_at >= ?`,
      )
      .get(sinceMs) as Record<string, unknown> | undefined;
    const actions = this.db
      .prepare('SELECT COUNT(*) AS count FROM card_actions WHERE created_at >= ?')
      .get(sinceMs) as Record<string, unknown> | undefined;

    return {
      messages: toNumber(row?.['messages']),
      answers: toNumber(row?.['answers']),
      cardActions: toNumber(actions?.['count']),
      errors: toNumber(row?.['errors']),
      distinctChats: toNumber(row?.['distinct_chats']),
      distinctQuestions: toNumber(row?.['distinct_questions']),
    };
  }

  close(): void {
    this.db.close();
  }
}

export function createTelemetryStore(path: string): TelemetryStoreLike | undefined {
  try {
    return new SqliteTelemetryStore(path);
  } catch (cause) {
    console.error(
      `[telemetry] SQLite unavailable at ${path}; evidence will not be recorded: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    return undefined;
  }
}

function safeJson(value: unknown): string | null {
  if (value === undefined) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  return 0;
}
