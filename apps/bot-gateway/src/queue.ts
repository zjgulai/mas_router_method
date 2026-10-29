/**
 * A tiny queue with two guarantees the gateway needs:
 *
 *   1. A global concurrency cap, so one busy group cannot exhaust the process.
 *   2. Per-chat serialisation, so two answers in the same thread do not overtake
 *      each other.
 *
 * It is intentionally not a durable job queue. Feishu only needs the handler to
 * return within three seconds; the actual generation can live in this process.
 */
export class ChatQueue {
  private active = 0;
  private readonly pending: (() => void)[] = [];
  private readonly chains = new Map<string, Promise<void>>();
  private readonly concurrency: number;

  constructor(concurrency: number) {
    this.concurrency = Math.max(1, concurrency);
  }

  enqueue(chatId: string, task: () => Promise<void>): Promise<void> {
    const previous = this.chains.get(chatId) ?? Promise.resolve();
    const next = previous
      .catch(() => {
        // A failed task must not poison the chain for the next message.
      })
      .then(() => this.runWithLimit(task));

    this.chains.set(chatId, next);
    void next.finally(() => {
      if (this.chains.get(chatId) === next) this.chains.delete(chatId);
    });
    return next;
  }

  stats(): { active: number; pending: number; chats: number } {
    return { active: this.active, pending: this.pending.length, chats: this.chains.size };
  }

  /** Test/shutdown helper: wait until no task is running or queued. */
  async drain(): Promise<void> {
    for (let i = 0; i < 12_000; i += 1) {
      if (this.active === 0 && this.pending.length === 0 && this.chains.size === 0) return;
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 5);
      });
    }
  }

  private async runWithLimit(task: () => Promise<void>): Promise<void> {
    await this.acquire();
    try {
      await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.concurrency) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.pending.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.active -= 1;
    const next = this.pending.shift();
    if (next !== undefined) next();
  }
}
