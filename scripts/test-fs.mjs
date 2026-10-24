/**
 * Filesystem helpers for tests that probe the repo.
 *
 * Several tests here work by corrupting or adding a real file and then running a
 * CLI as a **new process** to check that the tool notices. That shape is the point
 * — it tests the tool as it is actually used — but on the mounted workspace it is
 * unreliable in a way that has nothing to do with the tool.
 *
 * INC-002: on this mount, roughly one write in three is read back by a newly
 * spawned process as a stale 4096-byte block instead of what was written.
 * Measured with the same code: 19/60 bad on the mount, 0/60 in /tmp. The symptom
 * was tests failing intermittently, for reasons unrelated to their assertions —
 * the probe file was there, but its contents were somebody else's.
 *
 * `writeAndConfirm` establishes the precondition (the file is readable, by a new
 * process, with exactly the bytes intended) and retries until the environment
 * agrees. It does not weaken any assertion: if the content never lands, it throws.
 */
import { writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Write `content` to `path` and return only once a fresh process reads it back
 * byte-for-byte. Throws if it cannot be made so within `attempts`.
 */
export async function writeAndConfirm(path, content, attempts = 20) {
  let last = 'no attempt was made';
  for (let i = 0; i < attempts; i++) {
    await writeFile(path, content, 'utf8');
    const { stdout } = await execFileAsync(process.execPath, ['-e', `
      import('node:fs/promises').then(async (fs) => {
        const t = await fs.readFile(${JSON.stringify(path)}, 'utf8').catch((e) => 'ERR:' + e.code);
        process.stdout.write(t === ${JSON.stringify(content)} ? 'ok' : 'stale:' + t.length);
      });
    `]);
    if (stdout.trim() === 'ok') return;
    last = stdout.trim();
  }
  throw new Error(
    `writeAndConfirm could not make ${path} readable with the intended contents after ` +
    `${attempts} attempts (last read: ${last}). This is INC-002, the mount returning ` +
    `stale blocks after a write — not a failure of the code under test.`,
  );
}
