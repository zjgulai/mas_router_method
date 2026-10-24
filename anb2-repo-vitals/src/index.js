import { mkdir, appendFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRepo, fetchRepoFacts, GitHubError } from './github.js';
import { assess, headline } from './verdict.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const LOG = process.env.REPO_VITALS_LOG ?? join(ROOT, 'runs.ndjson');

function usage() {
  console.log(`repo-vitals — one repository in, one auditable verdict out.

  node src/index.js --repo <owner/name or github url>
  node src/index.js --repo nodejs/node --json

Every number in the output carries the URL it came from.
Set GITHUB_TOKEN to raise the API rate limit.`);
}

async function logRun(record) {
  try {
    await mkdir(dirname(LOG), { recursive: true });
    await appendFile(LOG, `${JSON.stringify(record)}\n`, 'utf8');
  } catch (cause) {
    // A lost log must not fail the user's request, but it must be loud.
    console.error(`[warn] could not write the run log: ${cause.message}`);
  }
}

function render(result) {
  const lines = [];
  lines.push(headline(result));
  lines.push('');
  lines.push(`score ${result.score.toFixed(2)}  ·  ${result.repo}  ·  assessed ${result.assessedAt}`);
  lines.push('');
  for (const s of result.signals) {
    lines.push(`  ${s.level.toUpperCase().padEnd(7)} ${s.label.padEnd(12)} ${s.value}`);
    if (s.blind) lines.push(`          blind spot: ${s.blind}`);
  }
  lines.push('');
  lines.push('Not measured at all:');
  for (const item of result.notMeasured) lines.push(`  - ${item}`);
  lines.push('');
  lines.push('Sources:');
  const seen = new Set();
  for (const s of result.signals) {
    if (s.source && !seen.has(s.source)) { seen.add(s.source); lines.push(`  ${s.source}`); }
  }
  return lines.join('\n');
}

async function main() {
  const argv = process.argv.slice(2);
  const at = argv.indexOf('--repo');
  const input = at >= 0 ? argv[at + 1] : undefined;
  const asJson = argv.includes('--json');

  if (input === undefined) { usage(); process.exitCode = 1; return; }

  const repo = parseRepo(input);
  if (repo === null) {
    console.error(`Could not read a repository name from ${JSON.stringify(input)}. Expected "owner/name" or a github.com URL.`);
    process.exitCode = 1;
    return;
  }

  const started = Date.now();
  const record = { at: new Date().toISOString(), input, repo: `${repo.owner}/${repo.name}`, status: 'running' };

  try {
    const facts = await fetchRepoFacts(repo, { token: process.env.GITHUB_TOKEN });
    const result = assess(facts);
    record.status = 'succeeded';
    record.score = result.score;
    record.band = result.band;
    record.ms = Date.now() - started;

    console.log(asJson ? JSON.stringify(result, null, 2) : render(result));
  } catch (cause) {
    record.status = 'failed';
    record.reason = cause instanceof Error ? cause.message : String(cause);
    record.ms = Date.now() - started;
    // Name what failed and what to do, not just that something did.
    console.error(
      cause instanceof GitHubError
        ? `Could not assess ${record.repo}: ${cause.message}`
        : `Unexpected failure assessing ${record.repo}: ${record.reason}`,
    );
    process.exitCode = 1;
  } finally {
    await logRun(record);
  }
}

if (process.argv[1]?.endsWith('index.js') === true) {
  main().catch((cause) => { console.error(cause.message); process.exitCode = 1; });
}
