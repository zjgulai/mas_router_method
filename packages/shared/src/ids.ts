import { z } from 'zod';

/**
 * Branded IDs.
 *
 * Every entity carries a prefixed id (`rec_`, `brd_`, ...) so that a stray id
 * shows up as obviously wrong in a log line instead of silently resolving to a
 * record of the wrong type. This matters more than usual here: the agent writes
 * these ids into tool arguments, and a model that confuses `rec_...` with
 * `run_...` should fail loudly at the schema boundary.
 */
const id = (prefix: string) =>
  z
    .string()
    .regex(
      new RegExp(`^${prefix}_[0-9a-zA-Z]{12,}$`),
      `expected an id starting with "${prefix}_"`,
    );

export const RecipeId = id('rec');
export const BrandId = id('brd');
export const ReferenceId = id('ref');
export const ProductionId = id('prd');
export const RunId = id('run');
export const EvalCaseId = id('evc');

export const IsoDateTime = z.string().datetime({ offset: true });

/** Deterministic id minting keeps fixtures and eval snapshots readable. */
export function mintId(prefix: string, randomBytes: () => string): string {
  return `${prefix}_${randomBytes()}`;
}
