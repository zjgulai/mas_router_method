/**
 * Which matrix cells each ticket covers, and how far it got.
 *
 * Why this exists rather than a hand-written column in matrix.json: a ticket's state
 * is already on disk — it *is* its directory. Copying that into the matrix would be a
 * second declaration of the same fact, and this repo has spent three rounds fixing
 * exactly that failure. So matrix.json says which cells a ticket claims (a fact only
 * the ticket knows), and this module reads the state (a fact only the directory knows).
 *
 * The mapping from ticket state to matrix status is deliberately not one-to-one.
 * `awaiting-verification` is *not* `verified`: the ticket says the work is done and
 * waiting for a person to check it, which is a claim, not evidence. Only `done` — which
 * the schema requires to carry an evidence ID — promotes a cell to verified.
 *
 *   open / in-progress        nobody has finished it        → pending
 *   awaiting-verification     built, not yet accepted       → claimed
 *   done                      accepted, with evidence       → landed
 *   abandoned                 stopped on purpose            → stopped
 *
 * A cell may be claimed by several tickets. It takes the *weakest* live one: if one
 * ticket for a cell is still in progress, the cell is not finished, no matter what
 * another ticket says about a different part of it.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { WORK } from './schema.mjs';

/** Ticket state → how it presents on the matrix. */
export const STATE_TO_CELL = {
  open: 'pending',
  'in-progress': 'pending',
  'awaiting-verification': 'claimed',
  done: 'landed',
  abandoned: 'stopped',
};

/**
 * Stages whose work cannot have a ticket yet, because it follows shipping.
 *
 * 运营 / 迭代 / 管理 describe what you do to a product that is running. Until it runs,
 * "nobody owns this cell" is not a gap — it is the calendar. Merging those with the
 * genuinely unplanned cells is the failure the matrix doc warns about in its own §四:
 * a blank has two kinds, and conflating them hides the one that matters.
 */
export const FUTURE_STAGES = ['运营', '迭代', '管理'];

/**
 * How an unclaimed cell should read.
 *
 *   gap    a stage you are in now, with no ticket — someone forgot, or decided not to
 *   future a stage you have not reached — not a gap
 *
 * Kept here rather than in the page so the CLI and the site cannot disagree.
 */
export function unclaimedKind(stage, cell) {
  if (cell.ticketState !== undefined) return null;
  return FUTURE_STAGES.includes(stage) ? 'future' : 'gap';
}

/** Weakest wins, so the order goes from least to most finished. */
const RANK = { pending: 0, claimed: 1, landed: 2, stopped: 3 };

/**
 * A ticket's `cells:` entry, parsed into `[{stage, layer}]`.
 *
 * Two spellings accepted, because both are natural and a parser that demanded one
 * would silently return nothing for the other:
 *
 *   cells: [开发·采集, 验收·采集]        a hand-written ticket
 *   cells: [*·采集, 开发·*]              a scoped ticket, `*` meaning any
 *
 * The wildcard form is not decoration: T-006 covers every stage of two layers, and
 * listing eight pairs invites the list going stale the moment a layer gains a stage.
 */
export function parseCells(value) {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const s = String(raw).trim();
    const parts = s.split(/[·・.]/).map((x) => x.trim());
    if (parts.length !== 2) return null;
    return { stage: parts[0], layer: parts[1] };
  }).filter((x) => x !== null);
}

function frontmatter(text) {
  if (!text.startsWith('---')) return {};
  const end = text.indexOf('\n---', 3);
  if (end < 0) return {};
  const data = {};
  for (const line of text.slice(3, end).split('\n')) {
    const m = /^([a-z_]+):\s*(.*)$/.exec(line.trim());
    if (m === null) continue;
    const [, key, value] = m;
    data[key] = value.startsWith('[') && value.endsWith(']')
      ? value.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean)
      : value;
  }
  return data;
}

/**
 * Read every ticket under work/tickets/<state>/.
 *
 * Returns records plus the problems found — a ticket claiming a cell that the matrix
 * does not have is a real error, not a detail: it means either the ticket is working on
 * something nobody planned, or the matrix lost a row. Both need a person.
 */
export async function readTickets(schema) {
  const out = [];
  const problems = [];
  const states = schema.entities.ticket?.states ?? ['open', 'in-progress', 'awaiting-verification', 'done', 'abandoned'];

  for (const state of states) {
    const dir = join(WORK, 'tickets', state);
    let files;
    try { files = (await readdir(dir)).filter((f) => f.endsWith('.md')); } catch { continue; }
    for (const file of files) {
      const text = await readFile(join(dir, file), 'utf8');
      const fm = frontmatter(text);
      const id = fm.id ?? file.replace(/\.md$/, '');
      const cells = parseCells(fm.cells);
      if (cells.length === 0) {
        // Not a problem — plenty of tickets (the recipe ones) are about the agent
        // product, not the data product. Listed so the page can say so rather than
        // leaving a reader wondering why a ticket is invisible here.
        out.push({ id, title: fm.title ?? '', state, cells: [], cellState: STATE_TO_CELL[state] ?? 'pending', evidence: fm.evidence ?? [], linked: false });
        continue;
      }
      out.push({
        id, title: fm.title ?? '', state,
        cells, cellState: STATE_TO_CELL[state] ?? 'pending',
        evidence: fm.evidence ?? [], linked: true,
      });
    }
  }
  return { tickets: out, problems };
}

/**
 * Expand `[{stage, layer}]` against the cells that actually exist.
 *
 * A wildcard means "every existing cell in this layer", not "every position in the
 * grid". The first version expanded against the full 8×8 and every scoped ticket then
 * appeared to claim 交付·存储 and 迭代·报告 — cells that are deliberately empty, and
 * which the checker then reported as errors. The wildcard is a shortcut for a list, and
 * a list of cells should contain cells.
 *
 * An explicit pair is returned as written, existing or not, so that a typo in a ticket
 * still fails the check.
 */
export function expandCells(cells, stages, layers, existing = null) {
  const out = [];
  const seen = new Set();
  for (const c of cells) {
    const isWild = c.stage === '*' || c.layer === '*';
    const stageList = c.stage === '*' ? stages : [c.stage];
    const layerList = c.layer === '*' ? layers : [c.layer];
    for (const s of stageList) {
      for (const l of layerList) {
        const key = `${s}\u0000${l}`;
        if (seen.has(key)) continue;
        // The filter applies to wildcard expansion only. An explicit pair is returned
        // as written even if no such cell exists, because that is the only way the
        // checker can report the typo — filtering it here made a misspelled cell
        // vanish instead of failing, which is the exact failure the check is for.
        if (isWild && existing !== null && !existing.has(key)) continue;
        seen.add(key);
        out.push({ stage: s, layer: l });
      }
    }
  }
  return out;
}

/**
 * Per-cell ticket aggregation.
 *
 * `state` is the weakest live cell-state among the claiming tickets, and `tickets`
 * lists every one of them so the page can show "claimed by T-006 (awaiting
 * verification)" instead of a bare colour.
 */
export function attach(tickets, stages, layers) {
  const byCell = new Map();
  const problems = [];
  for (const t of tickets) {
    if (!t.linked) continue;
    for (const c of expandCells(t.cells, stages, layers)) {
      const key = `${c.stage}\u0000${c.layer}`;
      if (!byCell.has(key)) byCell.set(key, { state: null, tickets: [] });
      const entry = byCell.get(key);
      entry.tickets.push({ id: t.id, title: t.title, state: t.state, cellState: t.cellState });
      const cur = entry.state;
      const next = t.cellState;
      // Abandoned is not "worse than pending" — it is *settled*. A stopped ticket
      // should not keep a cell looking half-built when another one finished it.
      if (cur === null) entry.state = next;
      else if (next === 'stopped') continue;
      else if (cur === 'stopped') entry.state = next;
      else if (RANK[next] < RANK[cur]) entry.state = next;
    }
  }
  return { byCell, problems };
}
