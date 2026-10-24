import type { Run } from '@mas/shared';

/**
 * Runs are the unit of observability (see `packages/shared/src/run.ts`). The port
 * exists so the runtime never knows whether history lives in SQLite or Postgres.
 */
export interface RunStore {
  saveRun(run: Run): Promise<void>;
  /** Scoped by brand: a run is never readable across tenants (ADR 0009). */
  getRun(brandId: string, runId: string): Promise<Run | null>;
  listRunsByBrand(brandId: string, limit?: number): Promise<Run[]>;
}
