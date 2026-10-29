/**
 * In-memory idempotency set.
 *
 * Feishu retries an event when the handler is slow or returns an error. A single
 * process only needs a TTL set; a durable queue would need a persistent store, and
 * that is a deployment decision, not a reason to reply twice.
 */
export class TtlSet {
  private readonly entries = new Map<string, number>();
  private readonly ttlMs: number;
  private readonly maxSize: number;

  constructor(ttlMs = 10 * 60_000, maxSize = 5_000) {
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
  }

  /** Returns true if the key was already present. Adds it otherwise. */
  seen(key: string): boolean {
    const now = Date.now();
    this.cleanup(now);
    const existing = this.entries.get(key);
    if (existing !== undefined && existing > now) return true;
    this.entries.set(key, now + this.ttlMs);
    if (this.entries.size > this.maxSize) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    return false;
  }

  get size(): number {
    this.cleanup(Date.now());
    return this.entries.size;
  }

  private cleanup(now: number): void {
    for (const [key, expiresAt] of this.entries) {
      if (expiresAt <= now) this.entries.delete(key);
    }
  }
}
