#!/usr/bin/env node
/**
 * Read the Stage 3 evidence file.
 *
 *   pnpm --filter @mas/bot-gateway telemetry top --days 7 --limit 20
 *   pnpm --filter @mas/bot-gateway telemetry stats --days 7
 *
 * `top` is the command that answers the PMO's "asked at least ten times a week"
 * question. `stats` is the health glance: messages, answers, card actions, errors.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { findRepoRoot } from '@mas/consult';
import { SqliteTelemetryStore } from '../telemetry.js';

const args = process.argv.slice(2);
const command = args[0] === 'stats' ? 'stats' : 'top';
const days = numberArg('--days', 7);
const limit = numberArg('--limit', 20);
const path =
  process.env['MAIN_AGENT_TELEMETRY_DB'] ??
  join(findRepoRoot(), '.data', 'main-agent-telemetry.db');

if (!existsSync(path)) {
  console.error(`telemetry: no evidence file at ${path}`);
  process.exit(2);
}

const store = new SqliteTelemetryStore(path);
const since = Date.now() - days * 86_400_000;
try {
  if (command === 'stats') {
    console.log(JSON.stringify(store.stats(since), null, 2));
  } else {
    const rows = store.topQuestions(since, limit);
    if (rows.length === 0) {
      console.log(`telemetry: no questions in the last ${days} day(s)`);
    } else {
      for (const row of rows) {
        const day = new Date(row.lastSeen).toISOString().slice(0, 10);
        console.log(`${String(row.count).padStart(4)}  ${day}  ${row.text}`);
      }
    }
  }
} finally {
  store.close();
}

function numberArg(name: string, fallback: number): number {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const parsed = Number.parseInt(args[index + 1] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
