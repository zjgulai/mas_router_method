import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReferenceAnalysis } from '@mas/shared';
import { createVodVisionAnalyzer } from '@mas/core/adapters/vod';
import { evaluateSpike, type Gate, type GroundTruth } from './spike-rules.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');

interface Clip {
  id: string;
  url: string;
  brandContext?: string;
  groundTruth?: GroundTruth;
}

interface Record {
  clipId: string;
  model: string;
  latencyMs: number;
  usage: unknown;
  analysis?: ReferenceAnalysis;
  gates: Gate[];
  passed: boolean;
  error?: string;
}

function value(argv: string[], flag: string): string | undefined {
  const at = argv.indexOf(flag);
  return at >= 0 ? argv[at + 1] : undefined;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const clipsPath = value(argv, '--clips');
  if (clipsPath === undefined) {
    throw new Error('Usage: spike-vod --clips <clips.json> [--model <id>] [--out <dir>]');
  }
  const apiKey = process.env['VOD_API_KEY'];
  if (apiKey === undefined || apiKey.trim().length === 0) {
    throw new Error('VOD_API_KEY is required; the spike makes real calls to the vod gateway.');
  }

  const model = value(argv, '--model') ?? process.env['VOD_MODEL'] ?? 'gemini-3.1-flash-lite';
  const outDir = value(argv, '--out') ?? join(REPO_ROOT, 'docs', 'evals', 'vision-spike');
  const baseUrl = process.env['VOD_BASE_URL'];

  const clips = JSON.parse(await readFile(clipsPath, 'utf8')) as Clip[];
  if (!Array.isArray(clips) || clips.length === 0) throw new Error('clips file must be a non-empty array');

  const analyzer = createVodVisionAnalyzer({
    apiKey,
    model,
    ...(baseUrl === undefined ? {} : { baseUrl }),
  });

  const records: Record[] = [];
  for (const clip of clips) {
    const started = Date.now();
    try {
      const { analysis, usage } = await analyzer.analyzeDetailed({
        url: clip.url,
        brandContext: clip.brandContext ?? 'brand content',
      });
      const latencyMs = Date.now() - started;
      const { gates, passed } = evaluateSpike(analysis, clip.groundTruth ?? {}, latencyMs);
      records.push({ clipId: clip.id, model, latencyMs, usage, analysis, gates, passed });
      console.log(`${passed ? 'PASS' : 'FAIL'}  ${clip.id}  ${latencyMs}ms`);
      for (const gate of gates) {
        console.log(`      ${gate.ok ? 'ok  ' : 'FAIL'} ${gate.name}: ${gate.observed}`);
      }
    } catch (cause) {
      const latencyMs = Date.now() - started;
      const error = cause instanceof Error ? cause.message : String(cause);
      records.push({ clipId: clip.id, model, latencyMs, usage: null, gates: [], passed: false, error });
      console.log(`FAIL  ${clip.id}  ${latencyMs}ms — ${error}`);
    }
  }

  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeModel = model.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = join(outDir, `${stamp}-${safeModel}.json`);
  await writeFile(path, `${JSON.stringify({ model, ranAt: new Date().toISOString(), records }, null, 2)}\n`, 'utf8');
  console.log(`\nWrote ${path}`);

  if (records.some((record) => !record.passed)) process.exitCode = 1;
}

if (process.argv[1]?.endsWith('spike-vod.ts') === true) {
  main().catch((cause: unknown) => {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
  });
}
