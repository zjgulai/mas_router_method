import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Find the repository root from any working directory.
 *
 * The bot can be started from `apps/bot-gateway` or from the repo root. Both must
 * find the same corpus; a relative path would silently load a different one.
 */
export function findRepoRoot(start: string = process.cwd()): string {
  let current = resolve(start);
  for (let i = 0; i < 12; i += 1) {
    if (
      existsSync(join(current, 'package.json')) &&
      existsSync(join(current, 'docs', 'product', 'matrix.json'))
    ) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return resolve(start);
}
