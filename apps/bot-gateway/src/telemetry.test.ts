import { describe, expect, it } from 'vitest';
import { SqliteTelemetryStore, normaliseQuestion, questionHash } from './telemetry.js';

describe('question grouping', () => {
  it('normalises case and whitespace before hashing', () => {
    expect(normaliseQuestion('  How  do I fix this? ')).toBe('how do i fix this?');
    expect(questionHash('How do I fix this?')).toBe(questionHash('how  do i fix this?'));
  });

  it('groups the same normalised question across chats', () => {
    const store = new SqliteTelemetryStore(':memory:');
    try {
      store.record({ kind: 'message', questionText: 'How do I fix this?', chatId: 'oc_1' });
      store.record({ kind: 'message', questionText: 'how  do i fix this?', chatId: 'oc_2' });
      store.record({ kind: 'message', questionText: 'A different question', chatId: 'oc_1' });

      const top = store.topQuestions(0);
      expect(top).toHaveLength(2);
      expect(top[0]?.count).toBe(2);
      expect(top[0]?.text).toBe('how do i fix this?');
    } finally {
      store.close();
    }
  });
});

describe('card action ledger', () => {
  it('records one row per event id and rejects the duplicate', () => {
    const store = new SqliteTelemetryStore(':memory:');
    try {
      expect(
        store.recordCardAction({
          eventId: 'ev_1',
          actionId: 'recipe.adopt',
          recipeId: 'rec_1',
          operatorOpenId: 'ou_user',
        }),
      ).toBe(true);
      expect(store.recordCardAction({ eventId: 'ev_1', actionId: 'recipe.adopt' })).toBe(false);
      expect(store.stats(0).cardActions).toBe(1);
    } finally {
      store.close();
    }
  });
});

describe('stats', () => {
  it('counts messages, answers, errors and distinct chats', () => {
    const store = new SqliteTelemetryStore(':memory:');
    try {
      store.record({ kind: 'message', questionText: 'q1', chatId: 'oc_1' });
      store.record({ kind: 'message', questionText: 'q2', chatId: 'oc_2' });
      store.record({ kind: 'answer', nodeId: 'n1', chatId: 'oc_1' });
      store.record({ kind: 'error', reason: 'timeout', chatId: 'oc_2' });

      expect(store.stats(0)).toMatchObject({
        messages: 2,
        answers: 1,
        errors: 1,
        cardActions: 0,
        distinctChats: 2,
        distinctQuestions: 2,
      });
    } finally {
      store.close();
    }
  });

  it('ignores rows older than the window', () => {
    const store = new SqliteTelemetryStore(':memory:');
    try {
      store.record({ kind: 'message', questionText: 'old', createdAt: 1 });
      store.record({ kind: 'message', questionText: 'new', createdAt: Date.now() });
      expect(store.stats(Date.now() - 60_000).messages).toBe(1);
    } finally {
      store.close();
    }
  });
});
