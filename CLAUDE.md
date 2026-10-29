# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A native-agent product for TikTok brand content. The agent takes a viral reference
video and produces a **Recipe**: a cloneable abstraction of that video, re-skinned
for one brand, structured enough that a shooter can act on it.

Two surfaces, deliberately separate:

- **`apps/workbench`** — the operator surface. Reviewing recipes, inspecting runs,
  editing brand guardrails, reading eval scores. Next.js App Router + Feishu OAuth.
- **`apps/bot-gateway`** — the Feishu surface, where the actual work happens. Meets
  users in the chat they already use.

Both call the same runtime. They differ only in how a request arrives and where
the result goes.

## Commands

```bash
pnpm install
pnpm dev                # turbo: all packages that define `dev`
pnpm typecheck          # turbo: tsc --noEmit across the workspace
pnpm test               # turbo: vitest (unit/integration — never calls a model)
pnpm lint
pnpm format

# One package
pnpm --filter @mas/core typecheck
pnpm --filter @mas/core test

# One test file, one test
cd packages/core && ./node_modules/.bin/vitest run src/run-agent.test.ts
cd packages/core && ./node_modules/.bin/vitest run -t "keeps a thrown error"

# Evals — these call the real model and cost money. Not part of `pnpm test`.
pnpm --filter @mas/evals eval
pnpm --filter @mas/evals eval -- --case <id>
```

Package scripts are invoked through `pnpm --filter <name> <script>`; every package
defines `typecheck`, `build`, `test`, `clean`.

## Architecture

### The dependency direction is one-way

```
apps/workbench ─┐
                ├─→ packages/core ─→ packages/shared
apps/bot-gateway┘         │
                          └─→ packages/feishu
packages/evals ──────────→ packages/core, packages/shared
```

`packages/shared` imports nothing from this repo. It is the schema layer — the
single place where a domain object is defined. If two packages need the same type,
it belongs there; a second definition is a bug that only surfaces after a schema
change.

The same rule applies to seed data: the four brand profiles live in
`packages/core/src/seed/brands.ts`, not in the eval fixtures. `evals` depends on
`core`, so a second copy in the fixtures would drift the moment a guardrail
changes — and the guardrails are exactly what the `should_fail` cases are built
on.

### `packages/core` is the whole product in one loop

`run-agent.ts` owns the agent loop: model call, step recording, budget enforcement,
cancellation, cost accounting. It is deliberately one file. Everything an agent
product must get right happens in *one* loop, and splitting that loop across
modules is how the budget check ends up not running on the path that matters.

`index.ts` composes it: `createRuntime()` wires the tools into an in-process MCP
server, sets the system prompt, and hands back a single `run()` method. Both apps
call that.

### Tools are defined against ports, not clients

`tools/brand.ts` declares interfaces (`BrandStore`, `ReferenceStore`, `RecipeStore`,
`VisionAnalyzer`) and builds the MCP tools against them. Production passes real
implementations; the eval harness passes fakes. The tool's prompt-visible contract
is identical in both, which is what makes agent behaviour testable without a live
Feishu tenant.

Adding a tool means updating **two** places: the tool array in `createBrandTools`
and the names in `brandToolNames()`. A tool missing from the allow-list is a silent
no-op — the hardest class of agent bug to notice.

### Tool failures are values, never exceptions

`tools/result.ts` defines the contract: `ok(text, data)` and `err(text, retryable)`,
converted by `toCallToolResult`. A handler that throws kills the entire run; a
handler that returns `isError: true` lets the model see the failure and try again.
`guard()` exists so an unexpected exception degrades instead of dying.

### The SDK configuration choices that matter

- `permissionMode: 'dontAsk'` — a headless bot has nobody to prompt. Tools off the
  allow-list are denied, not queued.
- `settingSources: []` — the SDK default already is `[]`, meaning no `CLAUDE.md` and
  no project settings are loaded into a run. This is intentional: the workflow
  prompt is the whole brief, and ambient repo config must not leak into a
  customer-facing bot. Do not "helpfully" add `'project'` here.
- `maxBudgetUsd` **plus** an in-loop cost check — the SDK limit fires after the
  expensive turn; the loop check stops before the next one.
- Accounting reads `modelUsage`, not `result.usage`. The latter is main-loop-only
  and per-turn; `modelUsage` is cumulative and includes subagents.

### Schemas are the boundary

Model output is untrusted input. `packages/shared` validates it with Zod at the
persistence boundary, so a malformed recipe fails loudly rather than becoming a
strange card in the review queue.

## Two different kinds of test

Both are required, and confusing them is the most common process failure here.

- **`pnpm test`** verifies *your code* — step mapping, budget arithmetic, schema
  validation, tool error paths. Fast, no model calls, runs in CI on every commit.
- **Eval runs** verify *the agent's judgement* — they call the real model, cost
  money, and run when behaviour changed: prompt edits, tool-schema changes, model
  upgrades, data-shape changes.

A ticket is not done when its unit tests pass. It is done when its eval cases pass.
See `docs/evals/` for the eval-set design and `packages/evals/` for the harness.

## TypeScript constraints

- **TypeScript is pinned to 5.9.3, not 7.x.** `typescript-eslint@8` declares
  `typescript: ">=4.8.4 <6.1.0"`, so upgrading breaks lint. Revisit when
  typescript-eslint supports 7.
- `exactOptionalPropertyTypes: true` and `noUncheckedIndexedAccess: true` are on.
  Optional properties need `?: T | undefined` when a value may be passed through
  explicitly — the `metrics` field in `tools/brand.ts` shows the pattern.
- `verbatimModuleSyntax: true` — type-only imports need `import type`.
- Package exports point at `./src/index.ts`, so no build step is needed between
  workspace packages during development.

## Project process

This repo vendors its engineering process into `.claude/skills/` (see
`.claude/skills/VENDOR.md` for provenance and upgrade steps) and adds its own
agent-product flow on top.

Start with **`/native-agent-dev`** — it routes to the right stage of the flow:
clarify → spec → tickets → build → eval → release. Use the vendored skills
(`/implement`, `/tdd`, `/code-review`, `/diagnosing-bugs`) directly for ordinary
software work that has no model in it.

**Which skills exist where is not obvious, and guessing wrong is expensive.** Three
sources, different locations:

| Source | Count | Where | How to call it |
| --- | --- | --- | --- |
| Vendored into this repo | 34 | `.claude/skills/` | by name, e.g. `/implement` |
| Client-provided plugins | 38 | not in the repo | needs a prefix, e.g. `anthropic-skills:agent-browser` |
| Agent Native Builder | 13 | `.claude/skills/anb*` | by name, e.g. `/anb` |

A skill missing from `.claude/skills/` is **not** a skill that does not exist — check
the "source" column in `docs/skills/skill-catalog.md` before concluding anything. The
first pass at auditing this repo got that wrong and reported 42 skills as fake.

`/anb` is a second, separate flow for non-technical product builders: six stages
(idea → runs → judgeable → shipable → observable → reusable) plus five checks. It
shares the runtime with `/native-agent-dev` but not the audience. See
`ANB-README.md`.

Two gates are worth being strict about:

- **The eval set is the spec.** A spec without eval cases is a wish; every later
  argument about quality is then an opinion.
- **Diagnose layer before changing prompt.** Wrong-layer fixes are the main reason
  agent work feels slow. Order: eval → data → tool → prompt.

## Agent skills

### Issue tracker

Local markdown under `.scratch/<feature>/`, since this repo has no remote yet. See
`docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `GLOSSARY.md` at the repo root, ADRs in `docs/adr/`. See
`docs/agents/domain.md`.

## Current state

Honest status, so the next session does not over-estimate what exists:

- `packages/shared` — complete schemas, typechecked, exported.
- `packages/core` — runtime, tool contracts, SQLite + vod adapters, the four seed
  brands, and the store contract suite. 31 unit tests passing.
- `packages/feishu` — signature verification, decryption, event normalisation.
  19 tests passing. Delivery and the HTTP server are not built.
- `packages/evals` — harness, 14 cases, 15 deterministic rules, store conformance.
  30 tests passing. Rubric judging is not implemented, and **no eval run has ever
  reached a real model** (the one attempt had no API key).
- `apps/workbench`, `apps/bot-gateway` — placeholder surfaces. Their designs are
  specified; only session resolution and a placeholder page exist.

## Main agent (2026-10-29)

- `packages/consult` — capability graph (16 nodes, 13 routes), portable knowledge
  bundle, BM25 retrieval, grounded answer composer, optional Anthropic / OpenAI
  synthesis. 33 tests.
- `apps/bot-gateway` — Feishu gateway in two modes: WebSocket long connection
  (default, no public URL) and HTTP webhook (`POST /events`). Idempotency, per-chat
  queue, mention matching by bot open_id, reply fallback, doctor/configure/authorize
  CLIs. 39 tests.
- `packages/feishu` — added Feishu `post` rich-text extraction and mention open ids.
- Knowledge is materialised by `scripts/materialize-main-knowledge.py` because some
  Markdown files in this workspace are stored in a form Node reads as binary.
- Acceptance and limits: `docs/product/main-agent-capability-graph.md`.
