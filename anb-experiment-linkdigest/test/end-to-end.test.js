const { test, assert, equal, includes } = globalThis.__suite;
const { execFile } = await import('node:child_process');
const { promisify } = await import('node:util');
const { mkdtemp, readFile, rm, writeFile } = await import('node:fs/promises');
const { tmpdir } = await import('node:os');
const { join, resolve, dirname } = await import('node:path');
const { fileURLToPath } = await import('node:url');

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'src', 'index.js');

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'linkdigest-'));
  try { return await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

/**
 * Every CLI run writes to a log file. It must be a temp file, not the repo — a
 * test whose side effect is a modified working tree is not isolated.
 */
async function runCli(args, logPath) {
  const env = { ...process.env, LINKDIGEST_LOG: logPath };
  try {
    const { stdout, stderr } = await run(process.execPath, [CLI, ...args], { cwd: ROOT, env });
    return { code: 0, stdout, stderr };
  } catch (cause) {
    return { code: cause.code ?? 1, stdout: cause.stdout ?? '', stderr: cause.stderr ?? '' };
  }
}

test('digests a local page end to end, and logs the run', async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, 'page.html');
    await writeFile(file, `<html><head><title>Local Page</title></head><body>
      <nav>Home</nav>
      <p>This is the first real sentence and it is comfortably long enough.</p>
      <p>This is the second real sentence, also long enough to be kept.</p>
    </body></html>`, 'utf8');
    const log = join(dir, 'runs.ndjson');
    const before = await readFile(log, 'utf8').catch(() => '');
    const beforeLines = before.trim() === '' ? 0 : before.trim().split('\n').length;

    const result = await runCli(['--offline', file, '--json'], log);
    equal(result.code, 0, `CLI failed: ${result.stderr}`);
    const digest = JSON.parse(result.stdout);
    equal(digest.title, 'Local Page');
    assert(digest.summary.length >= 2, `expected at least 2 summary lines, got ${digest.summary.length}`);

    const after = await readFile(log, 'utf8');
    const afterLines = after.trim().split('\n').length;
    equal(afterLines, beforeLines + 1, 'the run should have appended exactly one log line');
  });
});

test('a failing run is logged too, and exits non-zero', async () => {
  await withTempDir(async (dir) => {
  const log = join(dir, 'runs.ndjson');
  const before = await readFile(log, 'utf8').catch(() => '');
  const beforeLines = before.trim() === '' ? 0 : before.trim().split('\n').length;

  const result = await runCli(['--url', 'not a url'], log);
  assert(result.code !== 0, 'a bad input must exit non-zero');
  includes(result.stderr, 'Not a URL');

  const after = await readFile(log, 'utf8');
  const last = after.trim().split('\n').slice(-1)[0];
  const record = JSON.parse(last);
  equal(record.status, 'failed', 'the failure must be recorded, not just printed');
  includes(record.reason, 'Not a URL');
  equal(after.trim().split('\n').length, beforeLines + 1);
  });
});

test('the logged summary never exceeds the shared cap', async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, 'long.html');
    const sentence = 'This sentence exists to make the page long enough to matter. ';
    await writeFile(file, `<html><head><title>Long</title></head><body><p>${sentence.repeat(400)}</p></body></html>`, 'utf8');
    const logPath = join(dir, 'runs.ndjson');
    const result = await runCli(['--offline', file, '--json'], logPath);
    equal(result.code, 0);
    const log = await readFile(logPath, 'utf8');
    const record = JSON.parse(log.trim().split('\n').slice(-1)[0]);
    assert(record.summaryChars <= 2000, `logged summary was ${record.summaryChars} chars`);
  });
});

test('--help exits 0 and names the limits', async () => {
  const result = await runCli(['--help'], join(ROOT, '.test-help.log'));
  equal(result.code, 0);
  includes(result.stdout, '2000000 bytes');
});

test('no arguments prints usage and exits non-zero', async () => {
  const result = await runCli([], join(ROOT, '.test-none.log'));
  assert(result.code !== 0, 'should fail without input');
});
