import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');

/**
 * Read a repository document.
 *
 * In this workspace some Markdown files are stored in a compressed form that Node
 * reads as binary. The consult build materialises a plain-text snapshot at
 * `packages/consult/data/sources.json`; use it as a fallback so document checks
 * still verify the real prose instead of a block of NUL bytes.
 */
export function readRepoDoc(relativePath: string): string {
  const direct = readFileSync(join(ROOT, relativePath), 'utf8');
  if (!looksBinary(direct)) return direct;

  const snapshot = join(ROOT, 'packages', 'consult', 'data', 'sources.json');
  if (existsSync(snapshot)) {
    try {
      const parsed = JSON.parse(readFileSync(snapshot, 'utf8')) as {
        files?: { path?: string; text?: string }[];
      };
      const match = parsed.files?.find((file) => file.path === relativePath);
      if (typeof match?.text === 'string' && match.text.length > 0) return match.text;
    } catch {
      // Fall through to the direct read. A broken snapshot is a separate problem.
    }
  }
  return direct;
}

function looksBinary(text: string): boolean {
  return text.includes('\u0000') || text.includes('\uFFFD');
}
