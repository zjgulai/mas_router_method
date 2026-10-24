import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchPage } from './fetchPage.js';
import { extractText, extractTitle, countLinks } from './extract.js';
import { summarise, topWords, splitSentences } from './summarise.js';
import { LIMITS, truncate } from './limits.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
// Overridable so tests do not write into the repo. A test that mutates the
// working tree is a test that can fail for reasons unrelated to the code.
const LOG_PATH = process.env.LINKDIGEST_LOG ?? join(ROOT, 'runs.ndjson');

function parseArgs(argv) {
  const flags = new Set();
  const values = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      values.set(arg.slice(2), next);
      i += 1;
    } else {
      flags.add(arg.slice(2));
    }
  }
  return { flags, values };
}

function usage() {
  console.log(`link-digest — turn one web page into a short digest.

  --url <address>      required. http or https.
  --out <file>         optional. Write the digest as Markdown.
  --json               print the digest as JSON instead of text.
  --offline <file>     read HTML from a local file instead of the network.
  --help

Limits: ${LIMITS.maxResponseBytes} bytes, ${LIMITS.fetchTimeoutMs} ms, ${LIMITS.summarySentences} sentences.`);
}

/**
 * One run = one page in, one digest out, one line in the log.
 *
 * The log is written on success *and* on failure, because a log that only records
 * successes cannot answer "how often does this fail" — the question you actually
 * ask when something feels wrong.
 */
async function run(options) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const record = { startedAt, url: options.url ?? options.offlineFile ?? null, status: 'running' };

  let html = '';
  let source = {};
  let pageTitle = '';

  if (options.offlineFile !== undefined) {
    html = await readFile(options.offlineFile, 'utf8');
    source = { bytes: html.length, truncated: false, finalUrl: options.offlineFile, contentType: 'text/html' };
  } else {
    const page = await fetchPage(options.url);
    html = page.html;
    pageTitle = extractTitle(html);
    source = { bytes: page.bytes, truncated: page.truncated, finalUrl: page.finalUrl, contentType: page.contentType };
  }

  if (pageTitle === '') pageTitle = extractTitle(html);
  const text = extractText(html);
  const sentences = summarise(text);
  const digest = {
    title: pageTitle || '(untitled)',
    url: source.finalUrl,
    chars: text.length,
    truncated: source.truncated,
    sentenceCount: splitSentences(text).length,
    summary: sentences,
    keywords: topWords(text),
    links: countLinks(html),
    elapsedMs: Date.now() - startedMs,
  };

  // The whole point of the shared limit: this string can never exceed the cap,
  // because `truncate` counts its own marker.
  digest.logSummary = truncate(digest.summary.join(' '));

  record.status = 'succeeded';
  record.elapsedMs = digest.elapsedMs;
  record.summaryChars = digest.logSummary.length;
  record.truncated = digest.truncated;
  return { digest, record };
}

async function appendLog(record) {
  await mkdir(dirname(LOG_PATH), { recursive: true });
  await writeFile(LOG_PATH, `${JSON.stringify(record)}\n`, { flag: 'a' });
}

function render(digest) {
  const lines = [];
  lines.push(digest.title);
  lines.push(digest.url);
  lines.push('');
  for (const sentence of digest.summary) lines.push(`- ${sentence}`);
  if (digest.summary.length === 0) lines.push('- (no substantive sentences found)');
  lines.push('');
  if (digest.keywords.length > 0) {
    lines.push(`Keywords: ${digest.keywords.map((k) => `${k.word}(${k.n})`).join(', ')}`);
  }
  lines.push(`Chars: ${digest.chars} · Sentences: ${digest.sentenceCount} · Links: ${digest.links} · ${digest.elapsedMs}ms`);
  if (digest.truncated) lines.push('Note: the page was larger than the size cap and was cut short.');
  return lines.join('\n');
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  if (flags.has('help')) { usage(); return; }

  const url = values.get('url');
  const offlineFile = values.get('offline');
  if (url === undefined && offlineFile === undefined) {
    usage();
    process.exitCode = 1;
    return;
  }

  let record = { startedAt: new Date().toISOString(), url: url ?? offlineFile ?? null, status: 'failed' };
  try {
    const outcome = await run({ url, offlineFile });
    record = outcome.record;
    const output = flags.has('json') ? JSON.stringify(outcome.digest, null, 2) : render(outcome.digest);
    console.log(output);
    const out = values.get('out');
    if (out !== undefined) {
      await writeFile(out, `${flags.has('json') ? output : `${render(outcome.digest)}\n`}`, 'utf8');
      console.log(`\nWritten to ${out}`);
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    record.status = 'failed';
    record.reason = message;
    record.elapsedMs = 0;
    console.error(`Could not make a digest: ${message}`);
    process.exitCode = 1;
  } finally {
    // Logging failures must not become user-facing failures; but they must be loud
    // on stderr, because a silently lost log is a log you cannot trust.
    try {
      await appendLog(record);
    } catch (cause) {
      console.error(`[warn] failed to write the run log: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }
}

if (process.argv[1]?.endsWith('index.js') === true) {
  main().catch((cause) => {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
  });
}
