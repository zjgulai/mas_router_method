/**
 * The one reader of `work/schema.yml`.
 *
 * Everything else — the status command, the validator, the site generator — asks
 * this module what the entities and states are. Nothing else is allowed to write
 * a directory name by hand.
 *
 * That rule exists because the first version of `work status` hardcoded
 * `scan('ticket', …)` while the schema said `dir: tickets`. Five tickets were
 * invisible and the command reported "0 tickets, everything fine". Two copies of
 * one fact, disagreeing silently.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..');
export const WORK = join(ROOT, 'work');
export const SCHEMA_PATH = join(WORK, 'schema.yml');

/**
 * Parse the subset of YAML this file uses: nested maps, inline arrays, scalars.
 * A real YAML library would be one dependency for one file; the schema is written
 * by us and checked by `work check`, so a strict subset is the smaller risk.
 */
export function parseSchema(text) {
  const out = {};
  // stack of [indent, container]
  const stack = [[-1, out]];

  for (const raw of text.split('\n')) {
    const noComment = raw.replace(/\s+#.*$/, '');
    if (noComment.trim() === '' || noComment.trimStart().startsWith('#')) continue;

    const indent = noComment.length - noComment.trimStart().length;
    const line = noComment.trim();

    // Pop to the parent of this indent level.
    while (stack.length > 1 && indent <= stack[stack.length - 1][0]) stack.pop();
    const parent = stack[stack.length - 1][1];

    // A list item: "- name"
    const listItem = /^-\s+(.*)$/.exec(line);
    if (listItem !== null) {
      if (!Array.isArray(parent.__list)) parent.__list = [];
      parent.__list.push(unquote(listItem[1]));
      continue;
    }

    // Keys may contain hyphens: state names like `in-progress` are keys in the
    // transitions map. Matching only [A-Za-z0-9_] silently dropped two of them.
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (kv === null) continue;
    const [, key, valueRaw] = kv;
    const value = valueRaw.trim();

    if (value === '') {
      // Could be a map or a list; decide from the next line by defaulting to map.
      const child = {};
      parent[key] = child;
      stack.push([indent, child]);
      continue;
    }

    if (value.startsWith('[') && value.endsWith(']')) {
      parent[key] = value.slice(1, -1).split(',').map((s) => unquote(s.trim())).filter((s) => s !== '');
      continue;
    }

    parent[key] = value === 'true' ? true : value === 'false' ? false : unquote(value);
  }

  // Turn `{__list: [...]}` into a plain array.
  const clean = (node) => {
    if (Array.isArray(node)) return node.map(clean);
    if (node === null || typeof node !== 'object') return node;
    if (Array.isArray(node.__list) && Object.keys(node).length === 1) return node.__list.map(clean);
    const o = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === '__list') continue;
      o[k] = clean(v);
    }
    return o;
  };

  return clean(out);
}

function unquote(s) {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

let cached = null;

/** Load and shape the schema into what every caller needs. */
export async function loadSchema() {
  if (cached !== null) return cached;
  const text = await readFile(SCHEMA_PATH, 'utf8');
  const raw = parseSchema(text);

  const entities = raw.entities ?? {};
  const shaped = {};
  for (const [name, def] of Object.entries(entities)) {
    shaped[name] = {
      name,
      dir: def.dir ?? name,
      prefix: def.prefix ?? 'X',
      states: Array.isArray(def.states) ? def.states : [],
      transitions: def.transitions ?? {},
      stage: def.stage ?? 'any',
      rule: def.rule ?? '',
    };
  }

  // The stage order, shaped once. Every consumer reads this and none of them
  // writes a position down — `index` is derived from the array position here and
  // nowhere else, which is what stops the numbering going stale again.
  const stageOrder = Array.isArray(raw.stage_order) ? raw.stage_order : [];
  const stageLabels = raw.stage_labels ?? {};
  const stageSkills = raw.stage_skills ?? {};
  const stageOneline = raw.stage_oneline ?? {};

  cached = {
    version: raw.version ?? 0,
    entities: shaped,
    appendOnly: Array.isArray(raw.append_only) ? raw.append_only : [],
    stageEntities: raw.stage_entities ?? {},
    stageOrder,
    stageLabels,
    stageSkills,
    stageOneline,
    stages: stageOrder.map((id, i) => ({
      id,
      label: stageLabels[id] ?? '',
      skill: stageSkills[id] ?? '',
      oneline: stageOneline[id] ?? '',
      index: i + 1,
    })),
    raw,
  };
  return cached;
}

/** Where a record of `kind` in `state` lives on disk. One place computes this. */
export function stateDir(schema, kind, state) {
  return join(WORK, schema.entities[kind].dir, state);
}

/** Where a flat (non-state-machine) record lives. */
export function flatDir(schema, kind) {
  return join(WORK, schema.entities[kind].dir);
}

/*
 * CLI, for the one consumer that is not JavaScript: the site generators are
 * Python, and asking them to parse YAML would give this repo a second parser for
 * a file whose first parser already had a silent bug (it dropped hyphenated state
 * names, which made a ticket unable to reach `done`).
 *
 *   node scripts/schema.mjs stages --json
 */
const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const [cmd, ...flags] = process.argv.slice(2);
  if (cmd === 'stages' && flags.includes('--json')) {
    const { stages } = await loadSchema();
    process.stdout.write(JSON.stringify(stages));
  } else {
    console.error('usage: node scripts/schema.mjs stages --json');
    process.exitCode = 1;
  }
}
