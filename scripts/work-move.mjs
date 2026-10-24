/**
 * Move a record between states — the only sanctioned way to change state.
 *
 * Why a command instead of `mv`: the transition has to be checked against the
 * schema before it happens. A bare `mv` can put a ticket in a state that does not
 * exist, or move it backwards through a transition that was never allowed, and
 * nothing notices until `check` runs days later.
 *
 * What it deliberately does NOT do: invent the target. It reads the state list
 * from schema.yml, so adding a state there makes it legal here too.
 */
import { rename, readdir, readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { loadSchema, stateDir, WORK } from './schema.mjs';

const RED = '\x1b[31m', GREEN = '\x1b[32m', DIM = '\x1b[2m', BOLD = '\x1b[1m', RESET = '\x1b[0m';

function frontmatterId(text) {
  const m = /^id:\s*(.+)$/m.exec(text.slice(0, text.indexOf('\n---', 3)));
  return m === null ? null : m[1].trim();
}

async function findRecord(schema, id) {
  for (const [kind, def] of Object.entries(schema.entities)) {
    const flat = def.transitions === undefined || Object.keys(def.transitions).length === 0;
    const states = flat ? [''] : def.states;
    for (const state of states) {
      const dir = flat ? join(WORK, def.dir) : stateDir(schema, kind, state);
      let files;
      try { files = await readdir(dir); } catch { continue; }
      for (const f of files.filter((x) => x.endsWith('.md'))) {
        if (!f.startsWith(id + '-')) continue;
        const text = await readFile(join(dir, f), 'utf8');
        return { kind, def, flat, state, file: f, dir, text, fmId: frontmatterId(text) };
      }
    }
  }
  return null;
}

const [id, target] = process.argv.slice(2);

if (id === undefined || target === undefined) {
  console.error(`usage: work-move <ID> <state>

  Reads the legal states from work/schema.yml and refuses anything else.
  Example: node scripts/work-move.mjs T-001 awaiting-verification`);
  process.exitCode = 1;
} else {
  const schema = await loadSchema();
  const rec = await findRecord(schema, id);

  if (rec === null) {
    console.error(`${RED}no record with id ${id}${RESET}`);
    process.exitCode = 1;
  } else if (rec.flat) {
    // decisions and artifacts keep state in frontmatter; moving a file would
    // relocate history rather than advance it.
    console.error(`${RED}${id} is a ${rec.kind}${RESET} — it carries state in frontmatter, not in a directory.`);
    console.error(`  edit \`status:\` in ${join(rec.dir, rec.file)} instead, then run \`work check\`.`);
    process.exitCode = 1;
  } else if (!rec.def.states.includes(target)) {
    console.error(`${RED}${target} is not a state of ${rec.kind}${RESET}`);
    console.error(`  legal: ${rec.def.states.join(', ')}`);
    process.exitCode = 1;
  } else if (rec.state === target) {
    console.log(`${DIM}${id} is already ${target} — nothing to do${RESET}`);
  } else {
    const allowed = rec.def.transitions?.[rec.state] ?? [];
    if (!allowed.includes(target)) {
      console.error(`${RED}cannot move ${id} from ${rec.state} to ${target}${RESET}`);
      console.error(`  allowed from ${rec.state}: ${allowed.length === 0 ? '(none — this is a terminal state)' : allowed.join(', ')}`);
      if (allowed.length === 0) {
        console.error(`  ${DIM}if this move is genuinely needed, change schema.yml and record why.${RESET}`);
      }
      process.exitCode = 1;
    } else {
      // A ticket cannot enter `done` without evidence. This is the rule the
      // migration kept violating: code finished, ticket still said ready.
      if (target === 'done') {
        const ev = /^evidence:\s*\[(.*)\]$/m.exec(rec.text.slice(0, rec.text.indexOf('\n---', 3)));
        const has = ev !== null && ev[1].trim() !== '';
        if (!has) {
          console.error(`${RED}refusing to mark ${id} done${RESET} — no evidence recorded.`);
          console.error(`  add \`evidence: [E-xxx]\` to the frontmatter and write the evidence file first.`);
          console.error(`  ${DIM}"done" without a re-runnable command is a claim.${RESET}`);
          process.exitCode = 1;
        }
      }
      if (process.exitCode !== 1) {
        const to = stateDir(schema, rec.kind, target);
        try { await access(to); } catch { console.error(`${RED}target directory missing: ${to}${RESET}`); process.exitCode = 1; }
        if (process.exitCode !== 1) {
          await rename(join(rec.dir, rec.file), join(to, rec.file));
          console.log(`${GREEN}moved${RESET} ${id}  ${rec.state} ${DIM}→${RESET} ${BOLD}${target}${RESET}`);
          console.log(`  ${DIM}${join(to, rec.file).replace(process.cwd() + '/', '')}${RESET}`);
          console.log(`  ${DIM}staged: git add -A  (the move is visible in git as a rename)${RESET}`);
        }
      }
    }
  }
}
