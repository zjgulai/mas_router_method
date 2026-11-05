/**
 * The one reader for Markdown in this workspace.
 *
 * The mount here stores some .md files in a form where Node's fs returns binary
 * garbage (a stale block padded with NUL bytes — INC-001) while Python's open()
 * returns the real UTF-8 text. A naive `readFile(path, 'utf8')` does not throw:
 * it hands back garbage, downstream parsers see "no frontmatter", and a done
 * ticket with real evidence reports "records no evidence" — the failure that
 * shipped this module.
 *
 * Contract:
 *   - valid text            → returned as-is, no subprocess;
 *   - .md with binary bytes → Python utf-8 channel, result re-validated;
 *   - any other failure     → original error or an explicit one naming the path.
 *
 * It never returns empty text for a file it could not actually read: an empty
 * string reads as "no frontmatter" downstream, which is exactly the lie this
 * module exists to stop telling.
 */
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

/**
 * Read a file as UTF-8 text, transparently routing through Python when the
 * mount returns binary bytes for a Markdown file.
 */
export async function readText(path) {
  const isMarkdown = path.endsWith('.md');

  let raw;
  try {
    raw = await readFile(path); // Buffer first: decide from bytes, not a lossy string
  } catch (cause) {
    // ENOENT / EACCES etc. must keep their identity — a missing file is not a
    // decode failure, and converting it would fake "no evidence" downstream.
    throw cause;
  }

  if (isTextual(raw)) return raw.toString('utf8');

  if (isMarkdown) {
    // The mount's stale-block form. Python in this workspace reads the real
    // UTF-8 (see scripts/materialize-main-knowledge.py). -I isolates it from
    // ambient imports; no shell, so the path cannot be interpreted.
    const PYTHON_READER = 'from pathlib import Path; import sys; '
      + 'sys.stdout.buffer.write(Path(sys.argv[1]).read_bytes())';
    let bytes;
    try {
      // spawnSync, not execFile: the async pipe path on this mount loses bytes
      // from child stdout (measured: 1310→740 on a file, 87 NULs in a 12 KB
      // read) — a *second* corruption layer, independent of the first. Sync
      // spawn returns the child's bytes intact; the subprocess blocks this
      // event loop for milliseconds, which is acceptable for a fallback.
      const r = spawnSync('python3', ['-I', '-c', PYTHON_READER, path],
        { timeout: 30_000, maxBuffer: 16 * 1024 * 1024, encoding: 'buffer' });
      if (r.error) throw r.error;
      if (r.status !== 0) throw new Error(`python3 exited ${r.status}: ${r.stderr?.toString().split('\n')[0] ?? ''}`);
      bytes = r.stdout;
    } catch (fallbackError) {
      throw new Error(
        `readText: ${path} is binary to Node and the Python fallback failed too `
        + `(${fallbackError.message.split('\n')[0]})`,
      );
    }
    if (!isTextual(bytes)) {
      throw new Error(
        `readText: ${path} is binary to Node and Python returned non-textual bytes — `
        + 'not readable in this workspace',
      );
    }
    return bytes.toString('utf8');
  }

  throw new Error(
    `readText: ${path} is not a .md file but its bytes are not valid UTF-8 / contain NULs`,
  );
}

/**
 * Cheap textual check: valid UTF-8 and no NUL bytes. NULs are the mount's
 * corruption signature — valid UTF-8 never appears in these records.
 */
function isTextual(buf) {
  if (buf.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}
