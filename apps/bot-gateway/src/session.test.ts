import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionStore, SqliteSessionStore, sessionKeyFor } from './session.js';

describe('SessionStore', () => {
  it('keeps the last turns and expires them', () => {
    vi.useFakeTimers();
    try {
      const store = new SessionStore(1000, 3);
      store.append('t1', { role: 'user', text: 'a' });
      store.append('t1', { role: 'assistant', text: 'b' });
      store.append('t1', { role: 'user', text: 'c' });
      store.append('t1', { role: 'assistant', text: 'd' });
      expect(store.get('t1').map((turn) => turn.text)).toEqual(['b', 'c', 'd']);
      vi.advanceTimersByTime(1500);
      expect(store.get('t1')).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('SqliteSessionStore', () => {
  it('persists turns across instances', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mas-session-'));
    const path = join(dir, 'sessions.db');
    try {
      const first = new SqliteSessionStore(path, 60_000, 3);
      first.append('t1', { role: 'user', text: '区域相关性 0.9' });
      first.append('t1', { role: 'assistant', text: '>0.8 停' });
      first.close();

      const second = new SqliteSessionStore(path, 60_000, 3);
      expect(second.get('t1')).toEqual([
        { role: 'user', text: '区域相关性 0.9' },
        { role: 'assistant', text: '>0.8 停' },
      ]);
      second.append('t1', { role: 'user', text: '那 0.6 呢？' });
      expect(second.get('t1')).toHaveLength(3);
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('sessionKeyFor', () => {
  it('prefers thread, then root, then p2p chat', () => {
    expect(
      sessionKeyFor({ chatType: 'group', chatId: 'oc', threadId: 'omt', rootId: 'omr' }),
    ).toBe('thread:omt');
    expect(sessionKeyFor({ chatType: 'group', chatId: 'oc', rootId: 'omr' })).toBe('root:omr');
    expect(sessionKeyFor({ chatType: 'p2p', chatId: 'oc' })).toBe('chat:oc');
    expect(sessionKeyFor({ chatType: 'group', chatId: 'oc' })).toBeUndefined();
  });
});
