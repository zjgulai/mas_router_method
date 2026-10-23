# mas-router-method

A native-agent product for TikTok brand content: give it a viral reference video and
a brand, get back a **recipe** — a cloneable abstraction of that video, re-skinned
for the brand, structured enough for a shooter to act on.

Two surfaces: a **bot** in Feishu where the work happens, and a **workbench** where
the work is supervised.

## Status

Early. The runtime and schemas work; the two applications are manifests. See
`docs/roadmap.md` for what is being built and why, and `CLAUDE.md` for the current
state stated plainly.

## Start here

- `docs/product/thesis.md` — what this is for and the bet behind it
- `docs/roadmap.md` — what is next, ordered by risk
- `CLAUDE.md` — architecture, commands, and the constraints that are not obvious
- `GLOSSARY.md` — the vocabulary; use these words exactly

## Repo shape

```
apps/workbench      Next.js operator surface (recipe review, run inspection)
apps/bot-gateway    Feishu event gateway
packages/core       agent runtime, tool contracts, budget enforcement
packages/shared     Zod schemas — the only place a domain type is defined
packages/feishu     Feishu API adapter
packages/evals      eval harness and the cases themselves
docs/               thesis, ADRs, eval design, roadmap
```

## Setup

Requires Node 22+ and pnpm 12.

```bash
pnpm install
cp .env.example .env    # fill ANTHROPIC_API_KEY at minimum
pnpm typecheck
pnpm test
```

`ANTHROPIC_API_KEY` is required for anything that runs the agent. Unit tests and
typechecks do not need it.

## Development process

This repo vendors its engineering process into `.claude/skills/` and adds an
agent-product flow on top. Start with `/native-agent-dev`; it routes to the right
stage. Provenance and upgrade steps for the vendored skills are in
`.claude/skills/VENDOR.md`.

The one rule worth repeating: **the eval set is the spec.** A spec without eval
cases is a wish, and every later argument about quality becomes an opinion.
