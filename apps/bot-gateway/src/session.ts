import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ConversationTurn } from '@mas/consult';

export interface SessionStoreLike {
  get(key: string): ConversationTurn[];
  append(key: string, turn: ConversationTurn): void;
  clear(key: string): void;
  readonly size: number;
  close?(): void;
}

/**
 * In-memory thread sessions.
 *
 * Feishu topics/threads are the natural session boundary. A top-level group
 * message has no thread, so it starts fresh; a reply in a thread gets the last
 * few turns. This is fast but does not survive a restart.
 */
export class SessionStore implements SessionStoreLike {
  private readonly entries = new Map<
    string,
    { turns: ConversationTurn[]; expiresAt: number }
  >();

  constructor(
    private readonly ttlMs = 30 * 60_000,
    private readonly maxTurns = 6,
  ) {}

  get(key: string): ConversationTurn[] {
    const entry = this.entries.get(key);
    if (entry === undefined) return [];
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return [];
    }
    return entry.turns;
  }

  append(key: string, turn: ConversationTurn): void {
    const now = Date.now();
    const current = this.get(key);
    const turns = [...current, turn].slice(-this.maxTurns);
    this.entries.set(key, { turns, expiresAt: now + this.ttlMs });
  }

  clear(key: string): void {
    this.entries.delete(key);
  }

  get size(): number {
    this.cleanup();
    return this.entries.size;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }
}

/**
 * SQLite-backed sessions.
 *
 * One file, append/upsert per turn, TTL enforced on read. This survives a gateway
 * restart. It is still single-host: multiple gateway instances need a shared
 * Postgres/Redis store (ADR 0006's direction), not a shared SQLite file.
 */
export class SqliteSessionStore implements SessionStoreLike {
  private readonly db: DatabaseSync;

  constructor(
    path = ':memory:',
    private readonly ttlMs = 30 * 60_000,
    private readonly maxTurns = 6,
  ) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        key TEXT PRIMARY KEY,
        turns_json TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    `);
  }

  get(key: string): ConversationTurn[] {
    const row = this.db
      .prepare('SELECT turns_json, expires_at FROM sessions WHERE key = ?')
      .get(key) as { turns_json?: unknown; expires_at?: unknown } | undefined;
    if (row === undefined) return [];
    const expiresAt = typeof row.expires_at === 'number' ? row.expires_at : 0;
    if (expiresAt <= Date.now()) {
      this.db.prepare('DELETE FROM sessions WHERE key = ?').run(key);
      return [];
    }
    if (typeof row.turns_json !== 'string') return [];
    try {
      const parsed = JSON.parse(row.turns_json) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (turn): turn is ConversationTurn =>
            typeof turn === 'object' &&
            turn !== null &&
            (turn as { role?: unknown }).role !== undefined &&
            ((turn as { role: unknown }).role === 'user' ||
              (turn as { role: unknown }).role === 'assistant') &&
            typeof (turn as { text?: unknown }).text === 'string',
        )
        .slice(-this.maxTurns);
    } catch {
      return [];
    }
  }

  append(key: string, turn: ConversationTurn): void {
    const turns = [...this.get(key), turn].slice(-this.maxTurns);
    this.db
      .prepare(
        `INSERT INTO sessions (key, turns_json, expires_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           turns_json = excluded.turns_json,
           expires_at = excluded.expires_at`,
      )
      .run(key, JSON.stringify(turns), Date.now() + this.ttlMs);
  }

  clear(key: string): void {
    this.db.prepare('DELETE FROM sessions WHERE key = ?').run(key);
  }

  get size(): number {
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM sessions').get() as
      | { count?: unknown }
      | undefined;
    return typeof row?.count === 'number' ? row.count : 0;
  }

  close(): void {
    this.db.close();
  }
}

export function createSessionStore(
  path: string,
  ttlMs = 30 * 60_000,
  maxTurns = 6,
): SessionStoreLike {
  try {
    return new SqliteSessionStore(path, ttlMs, maxTurns);
  } catch (cause) {
    console.error(
      `[sessions] SQLite unavailable at ${path}; falling back to memory: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    return new SessionStore(ttlMs, maxTurns);
  }
}

/** Stable session key: thread > root > p2p chat; top-level group = no session. */
export function sessionKeyFor(message: {
  chatType: 'p2p' | 'group';
  chatId: string;
  threadId?: string;
  rootId?: string;
}): string | undefined {
  if (message.threadId !== undefined) return `thread:${message.threadId}`;
  if (message.rootId !== undefined) return `root:${message.rootId}`;
  if (message.chatType === 'p2p') return `chat:${message.chatId}`;
  return undefined;
}
