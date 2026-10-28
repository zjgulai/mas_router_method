/**
 * The collect ledger: one append-only file, and the rules that keep it honest.
 *
 * Why append-only rather than a table with an UPDATE: the requirement is "重跑不
 * 重写历史", and the cheapest way to guarantee that is to have no update path at
 * all. A store that *can* overwrite `first_seen_at` will eventually overwrite it —
 * a re-run, a backfill, a helpful migration. A store that only appends cannot.
 *
 * So `first_seen_at` is not a column that gets maintained. It is `min()` over the
 * observations of one item, computed on read. Nothing to maintain, nothing to
 * corrupt.
 *
 * Two record kinds, and the second one is the point:
 *
 *   run          a fetch happened. Recorded even when it returned zero items.
 *   observation  one item, as seen at one fetch
 *
 * **An empty run must be recorded.** If it is not, "this source found nothing this
 * week" and "this source was never run this week" are the same absence in the file,
 * and they call for opposite actions. That is the same shape as the failure this
 * repo has already recorded three times: a check that stopped running looked
 * exactly like a check that passed.
 *
 * Usage:
 *   node scripts/collect-store.mjs ingest <ledger.jsonl> <batch.json>
 *   node scripts/collect-store.mjs view <ledger.jsonl> [--source X]
 *   node scripts/collect-store.mjs verify <ledger.jsonl>
 *   node scripts/collect-store.mjs migrate <ledger.jsonl> --from 1 --to 2 [--rename a=b] [--default c=1]
 */
import { readFile, appendFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m',
      DIM = '\x1b[2m', BOLD = '\x1b[1m', RESET = '\x1b[0m';

/**
 * The ledger's own line format. Distinct from `schema_version`, which describes the
 * payload's meaning.
 *
 * Keeping two version numbers looks like over-engineering until you need it: the
 * envelope changes when this module's file layout changes (rare, and only ever by
 * this file's author), the data schema changes whenever the data product's columns
 * change (often, and by someone measuring something new). One number for both would
 * force every data change to look like a format change.
 */
export const LEDGER_VERSION = 1;

/** The four values of the region namespace. Never merged — see design §三·五. */
export const REGION_NAMESPACE = ['unattributable', 'insufficient', 'not_applicable'];

/** Fields every observation must carry. An adapter that omits one is rejected loudly. */
const OBSERVATION_REQUIRED = ['source', 'fingerprint', 'first_seen_at', 'fetched_at', 'source_task_id'];
const VERSIONS = ['schema_version', 'taxonomy_version', 'metric_version'];

const ms = (iso) => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) throw new Error(`not an ISO timestamp: ${JSON.stringify(iso)}`);
  return t;
};

/**
 * Validate one observation.
 *
 * Throws rather than returning a problem, because the caller is either ingesting a
 * batch (where one bad record means the batch's provenance is unknown) or verifying
 * a file (which reports rather than throws). Both want the message, not a boolean.
 */
export function checkObservation(obs, where = 'observation') {
  for (const f of OBSERVATION_REQUIRED) {
    if (obs[f] === undefined || obs[f] === null || obs[f] === '') {
      throw new Error(`${where}: missing required field "${f}"`);
    }
  }
  for (const v of VERSIONS) {
    // A key that exists but is `undefined` is the dangerous shape, not a missing key:
    // `'x' in obj` is true, so it passes a presence test, and it prints as blank —
    // which reads exactly like "version 0, the first one". Test the value.
    if (obs[v] === undefined || obs[v] === null || obs[v] === '') {
      throw new Error(`${where}: missing "${v}" — version fields are how a reader tells `
        + `which meaning a number carries; absent is not the same as "version 0"`);
    }
  }
  if (obs.raw === undefined) {
    throw new Error(`${where}: no "raw" payload — the design requires the original `
      + `payload be kept, because in six months the field dropped today will be the one needed`);
  }
  if (ms(obs.first_seen_at) > ms(obs.fetched_at)) {
    throw new Error(`${where}: first_seen_at (${obs.first_seen_at}) is after fetched_at `
      + `(${obs.fetched_at}) — an item cannot be seen for the first time after it was fetched`);
  }
  if (obs.region !== undefined && obs.region !== null) {
    const looksLikeRegion = /^[A-Z]{2}$/.test(obs.region);
    if (!looksLikeRegion && !REGION_NAMESPACE.includes(obs.region)) {
      throw new Error(`${where}: region "${obs.region}" is neither an ISO alpha-2 code nor one of `
        + `${REGION_NAMESPACE.join(' / ')} — a value outside the namespace would be silently `
        + `counted as a region, which is the摊派 the design forbids`);
    }
    /*
     * `region_basis` is required for every value that claims a judgement was made:
     * a real region, and `unattributable` (evidence exists and conflicts — the
     * conflict is the basis). It is required for `not_applicable` too, because
     * "this content belongs to no market" is also a claim about the content.
     *
     * It is NOT required for `insufficient`. That value's entire meaning is "no
     * basis was found", so demanding one contradicts the definition — and a rule
     * that contradicts a definition teaches the writer to invent a basis to get
     * past the check, which is worse than having no check. Catching this took one
     * run of the tool against a real payload.
     */
    const needsBasis = obs.region !== 'insufficient';
    if (needsBasis && obs.region_basis === undefined) {
      throw new Error(`${where}: region "${obs.region}" carries no region_basis — `
        + `every attributed record needs the basis and its version, or it cannot be audited later`);
    }
    if (obs.region === 'unattributable' && Array.isArray(obs.region_basis) && obs.region_basis.length < 2) {
      throw new Error(`${where}: region is "unattributable" but only one basis is named — `
        + `unattributable means the evidence conflicts, and one signal cannot conflict with itself`);
    }
  }
  return true;
}

/** Read a ledger file into `{ runs, observations, migrations }`, in file order. */
export async function readLedger(path) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (cause) {
    if (cause.code === 'ENOENT') return { runs: [], observations: [], migrations: [] };
    throw cause;
  }
  const out = { runs: [], observations: [], migrations: [] };
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      throw new Error(`${path}:${i + 1} is not JSON — the ledger is append-only, so a corrupt `
        + `line is not repaired in place; find the writer that produced it`);
    }
    if (rec.kind === 'run') out.runs.push(rec);
    else if (rec.kind === 'observation') out.observations.push(rec);
    else if (rec.kind === 'migration') out.migrations.push(rec);
    else throw new Error(`${path}:${i + 1} has unknown kind "${rec.kind}"`);
  }
  return out;
}

/**
 * Apply the ledger's migrations on read.
 *
 * Read-side, deliberately. Rewriting old records to a new schema destroys the one
 * thing that makes a version number meaningful — that the old record still says
 * what it said when it was written. A migration here is a *lens*, recorded in the
 * file, and old records stay queryable through it and without it.
 */
export function applyMigrations(observations, migrations) {
  if (migrations.length === 0) return observations;
  const ordered = [...migrations].sort((a, b) => a.from - b.from);
  return observations.map((obs) => {
    /*
     * A shallow copy is not enough. `{ ...obs }` shares the `raw` object with the
     * record on disk, so writing `rec.raw[to] = …` mutates the original in memory —
     * and "the old record still reads as written with no lens" stops being true the
     * moment anyone has run a migrated read first. Caught by a test that read both
     * ways in one process; in production it would have shown up as a record whose
     * schema_version says 1 and whose fields say 2.
     */
    let rec = { ...obs, raw: obs.raw === undefined ? undefined : structuredClone(obs.raw) };
    for (const m of ordered) {
      if (typeof rec.schema_version === 'number' && rec.schema_version >= m.to) continue;
      if (typeof rec.schema_version === 'number' && rec.schema_version < m.from) continue;
      for (const [from, to] of Object.entries(m.rename ?? {})) {
        if (rec.raw && from in rec.raw && !(to in rec.raw)) rec.raw[to] = rec.raw[from];
      }
      for (const [field, value] of Object.entries(m.defaults ?? {})) {
        if (rec.raw && !(field in rec.raw)) rec.raw[field] = value;
      }
      rec.schema_version = m.to;
      rec.migrated = [...(rec.migrated ?? []), `${m.from}→${m.to}`];
    }
    return rec;
  });
}

/**
 * Ingest one batch.
 *
 * Idempotency has two parts, and both are needed:
 *
 *   · the same `run_id` ingested twice is a no-op — that is a re-run of the same
 *     fetch, and re-recording it would inflate counts;
 *   · the same `run_id` with *different* content is an error, not a no-op. Silently
 *     accepting it would mean two different payloads both claim to be fetch 7 of
 *     source X, and no later reader could tell which one produced a number.
 *
 * A genuinely new fetch (new run_id, later fetched_at) appends normally — and
 * `first_seen_at` still does not move, because it is computed as a minimum.
 */
export async function ingest(path, batch) {
  const { run, observations } = batch;
  if (run === undefined) throw new Error('batch has no "run" — a fetch with no run record is not auditable');
  for (const f of ['source', 'run_id', 'source_task_id', 'fetched_at', 'status']) {
    if (run[f] === undefined || run[f] === '') throw new Error(`run: missing "${f}"`);
  }
  if (!['ok', 'error', 'partial'].includes(run.status)) {
    throw new Error(`run.status must be ok / error / partial, got "${run.status}"`);
  }
  const obs = observations ?? [];
  if (!Array.isArray(obs)) throw new Error('batch.observations must be an array (may be empty)');
  if (run.status === 'ok' && obs.length === 0 && (run.items ?? 0) > 0) {
    throw new Error(`run says ${run.items} items but carries no observations — `
      + `a count with no records behind it is a claim, not a measurement`);
  }

  obs.forEach((o, i) => checkObservation(o, `observations[${i}]`));

  const existing = await readLedger(path);
  const priorRun = existing.runs.find((r) => r.run_id === run.run_id);
  if (priorRun !== undefined) {
    /*
     * Compare by value, not by serialisation.
     *
     * The first version compared `JSON.stringify` of both sides and the re-run was
     * rejected — same content, different key order, because one object was written
     * as `{kind, ...run}` and the other compared as `{...run, kind}`. A comparison
     * that depends on insertion order reports "different" for identical data, and
     * the message it prints ("already ingested with different content") is then a
     * lie about a true thing. Canonicalise by sorted keys.
     */
    const canon = (o) => JSON.stringify(
      Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'kind' && k !== 'ledger_version')
        .sort(([a], [b]) => a.localeCompare(b))),
    );
    if (canon(priorRun) === canon(run)) {
      return { appended: 0, runs: 0, skipped: `run ${run.run_id} already recorded — nothing to do` };
    }
    throw new Error(`run_id "${run.run_id}" was already ingested with different content. `
      + `Re-running a fetch is idempotent; two different records claiming to be the same fetch is not. `
      + `Use a new run_id.`);
  }

  // Duplicate observations *within* one batch are rejected rather than de-duplicated:
  // the adapter produced them, and an adapter that emits one item twice has a bug
  // that dedup would hide. Cross-source duplicates are the audit's business, not the
  // store's — the store keeps what it was given.
  const seen = new Set();
  for (const o of obs) {
    const key = `${o.source}\u0000${o.fingerprint}\u0000${o.fetched_at}`;
    if (seen.has(key)) throw new Error(`duplicate observation in one batch: ${o.source}/${o.fingerprint}`);
    seen.add(key);
  }

  const lines = [
    JSON.stringify({ kind: 'run', ledger_version: LEDGER_VERSION, ...run }),
    ...obs.map((o) => JSON.stringify({ kind: 'observation', ledger_version: LEDGER_VERSION, ...o })),
  ];
  if (existing.migrations.length > 0) {
    // A new record written after a migration must already speak the newest schema,
    // otherwise reading the file needs two lenses for two neighbouring lines.
    const newest = existing.migrations.reduce((m, x) => (x.to > m.to ? x : m));
    for (const o of obs) {
      if (o.schema_version !== newest.to) {
        throw new Error(`ledger has been migrated to schema_version ${newest.to}, but this observation `
          + `declares ${o.schema_version}. Write new records in the current schema; old ones stay as they are.`);
      }
    }
  }
  await appendFile(path, lines.join('\n') + '\n', 'utf8');
  return { appended: obs.length, runs: 1, skipped: null };
}

/**
 * Collapse observations into one row per item.
 *
 * `first_seen_at` is the minimum, `last_fetched_at` the maximum, and the payload is
 * the *latest* one. The latest payload is what a report should show; `first_seen_at`
 * is what any time series must be anchored to, because interaction counts grow with
 * post age and anchoring to the latest fetch turns "scraped later" into "more
 * popular" — the failure mode the design calls 抓取时滞.
 */
export function view(observations, migrations = []) {
  const migrated = applyMigrations(observations, migrations);
  const byKey = new Map();
  for (const o of migrated) {
    const key = `${o.source}\u0000${o.fingerprint}`;
    const cur = byKey.get(key);
    if (cur === undefined) {
      byKey.set(key, {
        source: o.source,
        fingerprint: o.fingerprint,
        first_seen_at: o.first_seen_at,
        last_fetched_at: o.fetched_at,
        observations: 1,
        sources: new Set([o.source]),
        region: o.region ?? 'insufficient',
        raw: o.raw,
        versions: {
          schema: o.schema_version,
          taxonomy: o.taxonomy_version,
          metric: o.metric_version,
        },
      });
      continue;
    }
    cur.observations += 1;
    cur.sources.add(o.source);
    if (ms(o.first_seen_at) < ms(cur.first_seen_at)) cur.first_seen_at = o.first_seen_at;
    if (ms(o.fetched_at) >= ms(cur.last_fetched_at)) {
      cur.last_fetched_at = o.fetched_at;
      cur.raw = o.raw;
      cur.versions = { schema: o.schema_version, taxonomy: o.taxonomy_version, metric: o.metric_version };
      if (o.region !== undefined) cur.region = o.region;
    }
  }
  return [...byKey.values()].map((r) => ({ ...r, sources: [...r.sources] }));
}

/** Structural problems in a ledger, as strings. Empty means the invariants hold. */
export function verify({ runs, observations }) {
  const problems = [];
  const runIds = new Set(runs.map((r) => r.run_id));

  observations.forEach((o, i) => {
    try {
      checkObservation(o, `line ${i + 1} (${o.source ?? '?'}/${o.fingerprint ?? '?'})`);
    } catch (cause) {
      problems.push(cause.message);
    }
    if (o.source_task_id !== undefined && runs.length > 0 && !runIds.has(o.source_task_id) && !runIds.has(o.run_id)) {
      // Observations whose run is missing cannot be audited for latency: there is no
      // fetch time, only the item's own claim about when it was fetched.
      const matched = runs.some((r) => r.source_task_id === o.source_task_id);
      if (!matched) problems.push(`observation ${o.source}/${o.fingerprint} cites run "${o.source_task_id}", which is not in the ledger`);
    }
  });

  const keys = new Set();
  for (const o of observations) {
    const k = `${o.source}\u0000${o.fingerprint}\u0000${o.fetched_at}`;
    if (keys.has(k)) problems.push(`duplicate observation record: ${o.source}/${o.fingerprint} at ${o.fetched_at}`);
    keys.add(k);
  }

  // Every source that has observations must also have run records — otherwise the
  // miss rate has no denominator and an outage reads as "this source is quiet".
  const observedSources = new Set(observations.map((o) => o.source));
  for (const s of observedSources) {
    if (!runs.some((r) => r.source === s)) problems.push(`source "${s}" has observations but no run records`);
  }

  return problems;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
//
// Guarded, because this file is also a module: the tests import `ingest`, `view`,
// `verify` and `checkObservation` from it. Without the guard, importing it runs the
// CLI with the *test runner's* argv, falls through to the usage branch, and sets
// `process.exitCode = 2` — so a file whose fourteen tests all pass is reported as a
// failure by the test runner, with no failing assertion to look at. It cost a
// debugging round here; it would cost more in CI, where the exit code is the answer.

const invokedDirectly = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;

const argv = invokedDirectly ? process.argv.slice(2) : [];
const cmd = argv[0];
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? fallback : argv[i + 1];
};
const flagAll = (name) => {
  const out = [];
  argv.forEach((a, i) => { if (a === `--${name}`) out.push(argv[i + 1]); });
  return out;
};

if (cmd === 'ingest') {
  const [, ledger, batchPath] = argv;
  try {
    const batch = JSON.parse(await readFile(batchPath, 'utf8'));
    const r = await ingest(ledger, batch);
    if (r.skipped !== null) console.log(`${DIM}${r.skipped}${RESET}`);
    else console.log(`${GREEN}ingested${RESET} 1 run, ${BOLD}${r.appended}${RESET} observations`);
    process.exitCode = 0;
  } catch (cause) {
    console.error(`${RED}rejected${RESET} — ${cause.message}`);
    process.exitCode = 1;
  }
} else if (cmd === 'view') {
  const ledger = argv[1];
  const only = flag('source');
  const { observations, migrations } = await readLedger(ledger);
  let rows = view(observations, migrations);
  if (only !== null) rows = rows.filter((r) => r.source === only);
  console.log(`\n${BOLD}items${RESET} ${DIM}${rows.length} distinct, ${observations.length} observations, `
    + `${migrations.length} migration(s)${RESET}\n`);
  for (const r of rows.slice(0, 40)) {
    console.log(`  ${DIM}${r.first_seen_at.slice(0, 16)}${RESET}  ${r.source.padEnd(8)}`
      + `${(r.fingerprint ?? '').slice(0, 12).padEnd(14)}${String(r.observations).padStart(2)}×  `
      + `${r.region.padEnd(15)}${DIM}v${r.versions.schema}${RESET}`);
  }
  if (rows.length > 40) console.log(`  ${DIM}… ${rows.length - 40} more${RESET}`);
  console.log();
} else if (cmd === 'verify') {
  const { runs, observations, migrations } = await readLedger(argv[1]);
  const problems = verify({ runs, observations });
  if (problems.length === 0) {
    console.log(`${GREEN}ok${RESET} — ${runs.length} runs, ${observations.length} observations, `
      + `${migrations.length} migrations, invariants hold`);
    process.exitCode = 0;
  } else {
    console.log(`${RED}${problems.length} problem(s)${RESET}\n`);
    for (const p of problems) console.log(`  ${RED}•${RESET} ${p}`);
    process.exitCode = 1;
  }
} else if (cmd === 'migrate') {
  const ledger = argv[1];
  const from = Number(flag('from'));
  const to = Number(flag('to'));
  const rename = flagAll('rename').map((s) => s.split('=')).reduce((acc, [a, b]) => ({ ...acc, [a]: b }), {});
  const defaults = flagAll('default').map((s) => s.split('=')).reduce((acc, [a, ...rest]) => {
    const raw = rest.join('=');
    let v = raw;
    try { v = JSON.parse(raw); } catch { /* keep as string */ }
    return { ...acc, [a]: v };
  }, {});

  if (!Number.isInteger(from) || !Number.isInteger(to) || to <= from) {
    console.error(`${RED}migrate needs --from N --to M with M > N${RESET}`);
    process.exitCode = 2;
  } else {
    const { observations, migrations } = await readLedger(ledger);
    const trial = applyMigrations(observations, [...migrations, { from, to, rename, defaults }]);
    // The trial read is the gate: a migration that loses records is not applied.
    // "Queryable after migration" is checked, not asserted.
    const before = new Set(observations.map((o) => `${o.source}/${o.fingerprint}/${o.fetched_at}`));
    const after = new Set(trial.map((o) => `${o.source}/${o.fingerprint}/${o.fetched_at}`));
    const lost = [...before].filter((k) => !after.has(k));
    if (lost.length > 0) {
      console.error(`${RED}refusing to migrate${RESET} — the trial read lost ${lost.length} record(s), e.g. ${lost[0]}`);
      process.exitCode = 1;
    } else {
      const rec = {
        kind: 'migration', ledger_version: LEDGER_VERSION,
        from, to, rename, defaults,
        applied_at: new Date().toISOString(),
        note: 'read-side only: records written under schema_version <= ' + from + ' are interpreted through this lens, byte-identical on disk',
      };
      await appendFile(ledger, JSON.stringify(rec) + '\n', 'utf8');
      console.log(`${GREEN}migrated${RESET} ${from} → ${to}  ${DIM}${trial.length} records still readable, `
        + `${Object.keys(rename).length} renamed, ${Object.keys(defaults).length} defaulted${RESET}`);
      process.exitCode = 0;
    }
  }
} else if (invokedDirectly) {
  console.error(`usage: collect-store <ingest|view|verify|migrate> <ledger.jsonl> [...]`);
  process.exitCode = 2;
}
