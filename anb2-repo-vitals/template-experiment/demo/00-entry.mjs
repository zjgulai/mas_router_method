import { run } from '../runner.mjs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const code = await run({ dir: dirname(fileURLToPath(import.meta.url)) });
process.exit(code);
