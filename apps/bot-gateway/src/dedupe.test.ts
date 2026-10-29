import { describe, expect, it, vi } from 'vitest';
import { TtlSet } from './dedupe.js';

describe('TtlSet', () => {
  it('returns true only for a repeated key', () => {
    const set = new TtlSet();
    expect(set.seen('a')).toBe(false);
    expect(set.seen('a')).toBe(true);
    expect(set.seen('b')).toBe(false);
    expect(set.size).toBe(2);
  });

  it('forgets a key after its TTL', () => {
    vi.useFakeTimers();
    try {
      const set = new TtlSet(1000);
      expect(set.seen('a')).toBe(false);
      vi.advanceTimersByTime(1500);
      expect(set.seen('a')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds memory by dropping the oldest key', () => {
    const set = new TtlSet(60_000, 2);
    set.seen('a');
    set.seen('b');
    set.seen('c');
    expect(set.size).toBe(2);
    expect(set.seen('a')).toBe(false);
  });
});
