# ADR Index and Decision Inventory

This folder holds the decisions that are expensive to reverse. This file is the
index, and the inventory of decisions that are still **implicit or missing** —
because an unrecorded decision is one that gets re-litigated, or worse, silently
changed.

Status legend:

- **Recorded** — an ADR exists and is accepted.
- **Implicit** — the decision is visible in code or `CLAUDE.md` but has no ADR.
  Load-bearing ones should be promoted.
- **Missing** — the decision has not been made, or was made without a record.
- **Deferred** — consciously out of scope for now.

## Index

| ADR | Title | Status |
|---|---|---|
| [0001](./0001-agent-sdk-as-runtime.md) | Use the Claude Agent SDK as the runtime | Accepted |
| [0002](./0002-schema-layer-owns-the-domain.md) | One shared schema package owns the domain | Accepted |
| [0003](./0003-tool-failures-are-values.md) | Tool failures are values, never exceptions | Accepted |
| [0004](./0004-headless-permission-model.md) | Headless runs load no ambient config and deny unlisted tools | Accepted |
| [0005](./0005-model-and-budget-policy.md) | Pin the model, gate upgrades on eval, one budget ceiling | Accepted |
| [0006](./0006-persistence-and-retention.md) | SQLite now, Postgres before the bot; one RunStore and explicit retention | Accepted |
| [0007](./0007-vision-analysis-provider.md) | Dedicated video-understanding service behind the port | Accepted (provider spike pending) |
| [0008](./0008-workflow-versioning.md) | Version every workflow; gate prompt changes on eval | Accepted |
| [0009](./0009-brand-isolation.md) | Brand scope is an argument on every store call, enforced by tests | Accepted |
| [0010](./0010-main-agent-shared-state.md) | Main agent state moves to Postgres before a second gateway instance | Proposed |

## Inventory

| # | Decision | Status | Where it lives | If it stays undecided |
|---|---|---|---|---|
| 1 | Runtime is the Claude Agent SDK; only `run-agent.ts` imports it | Recorded | ADR 0001 | — |
| 2 | `packages/shared` owns every domain type; validate at boundaries | Recorded | ADR 0002 | — |
| 3 | Tool failures are `ok`/`err` values, never throws | Recorded | ADR 0003 | — |
| 4 | Headless permission model: `dontAsk`, `settingSources: []`, allow-list only | Recorded | ADR 0004 | A customer-facing run could load repo config or hang on a prompt |
| 5 | Cost accounting reads `modelUsage`, not `result.usage` | Implicit | `CLAUDE.md`, `run-agent.ts` | Under-counting subagent and compaction cost; budget checks drift |
| 6 | Model choice and upgrade policy | **Recorded** | ADR 0005 | — |
| 7 | Budget policy: config default vs Playbook | **Recorded** | ADR 0005: one ceiling, `$2.00` | — |
| 8 | Run persistence, retention, and who may read a transcript | **Recorded** | ADR 0006: `RunStore` + retention table | — |
| 9 | `sessionDir` configuration | **Resolved** | ADR 0006: removed until session resume exists | — |
| 10 | Reference and Analysis storage; source-media retention | **Recorded** | ADR 0006: analysis kept, source media never stored | — |
| 11 | Vision analysis provider, sampling, timeout, fallback | **Accepted (spike pending)** | ADR 0007: dedicated service, provider chosen by spike | Vendor and price unknown until the spike closes |
| 12 | Prompt and workflow versioning | **Recorded** | ADR 0008: version bump + eval gate | — |
| 13 | Brand isolation: every query scoped, no cross-brand reads | **Recorded** | ADR 0009: scope argument + adapter test suite | — |
| 14 | Store technology (Postgres / SQLite / external) | **Recorded** | ADR 0006: SQLite now, Postgres before Milestone 2 | — |
| 15 | Feishu auth, workbench auth | Deferred | Roadmap milestone 2–3 | — |
| 16 | Deployment shape, rollback, secrets | Deferred | Roadmap | — |
| 17 | Main agent thread sessions: SQLite per host, 30-min TTL | **Recorded** | ADR 0010; `apps/bot-gateway/src/session.ts` | A second instance loses thread context |
| 18 | Main agent idempotency and queue are process-local | **Missing** | ADR 0010 (proposed) | Duplicate events can produce duplicate answers across instances |
| 19 | Main agent idempotency/queue/session shared store | **Proposed** | ADR 0010: Postgres tables + `SKIP LOCKED` | Multi-instance deployment is unsafe until implemented |

## Findings from the code (2026-10-24)

All four were addressed by ADRs 0005–0009 on the same date. The list is kept
because it explains why those records exist.

1. **`sessionDir` is dead config.** `config.ts` declares and loads it, and
   `grep -rn sessionDir packages apps` finds no consumer outside `dist/`. Either
   wire session persistence or delete the field; a config key that promises
   durability it does not provide is worse than no key.
2. **Two budget ceilings.** `config.ts` defaults to `$0.50`; `PLAYBOOK.md` sets a
   temporary protection cap of `$2.00`. One of them has to win before the tracer,
   or budget behaviour depends on which document you read.
3. **Runs are not persisted.** `Run` is fully specified in `packages/shared`, and
   `runAgent` returns everything it needs — but nothing writes it. The workbench
   timeline and the eval baseline both depend on a `RunStore` that does not exist.
4. **The first tracer depends on three missing decisions**: model policy (6),
   vision provider (11), and where the recipe and run are stored (8, 14).

## Open follow-ups

No decision blocks the first tracer. Two records are owed before the next
milestone:

| Where | What must be recorded |
|---|---|
| ADR 0007 addendum | The chosen video-understanding vendor, its cost per analysis, and the spike scores |
| New ADR | Retention review after ten real runs: actual cost, p95 latency, and whether the `$2.00` ceiling moves |

## Conventions

- One decision per record. If the title needs "and", split it.
- Record the losing options and what they cost.
- Supersede, never rewrite: set the old status to `Superseded by NNNN`.
- A decision that is visible in code but unrecorded is a bug in this folder, not
  a private implementation detail.
