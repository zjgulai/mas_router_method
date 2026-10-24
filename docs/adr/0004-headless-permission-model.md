# 0004. Headless runs load no ambient config and deny unlisted tools

**Status:** accepted
**Date:** 2026-10-24

## Context

Runs are started by a Feishu message or a workbench click, with no human sitting
in front of a permission dialog. Two failure modes follow from that:

1. **A prompt is a hang.** If a tool call requires confirmation, nobody answers,
   and the run stalls until it times out — the worst possible outcome for a chat
   product, because the user sees silence rather than an error.
2. **Ambient config is an injection surface.** The SDK loads `CLAUDE.md`, project
   settings, and skills by default in interactive use. In a customer-facing bot,
   any repository text that reaches that path becomes part of the system brief.
   A malicious or merely stale instruction in a repo file would outrank the
   product prompt.

The alternatives were: prompt the user in Feishu (slow, and the interaction
surface does not support approval cards yet), use `bypassPermissions` (every tool
allowed, including ones we did not design for), or deny everything not explicitly
allowed.

## Decision

Every run is configured with:

- `permissionMode: 'dontAsk'` — a tool not on the allow-list is denied outright,
  never queued for a human.
- `settingSources: []` — no `CLAUDE.md`, no project settings, no skills. The
  workflow prompt is the entire brief.
- `allowedTools: brandToolNames('brand')` — the allow-list is derived from the
  tool factory, so it cannot drift from the tool array.

The same rules apply to eval runs. An eval that ran with different ambient config
would not be measuring the product.

## Consequences

**Easier:** a headless run either proceeds or fails with a visible reason; no
silent hangs. Repo instructions cannot leak into a customer-facing prompt, which
also makes runs reproducible across machines.

**Harder:** developers cannot rely on `CLAUDE.md` or project skills to steer the
agent at runtime. Anything the agent must know has to be in the workflow prompt,
passed explicitly, or exposed as a tool. This is intentional: the prompt becomes
the reviewable artifact.

**Rule that follows:** adding a tool means updating both `createBrandTools` and
`brandToolNames()`. A tool missing from the allow-list is a silent no-op, and the
denial looks like a model failure in the timeline.

**Accepted:** `dontAsk` turns a missing tool into a denial the model may retry
uselessly. Mitigation: the denial text names the tool and says it is not
available; the eval suite covers the tools the workflow relies on.

## What we would revisit

If the product adds a human-in-the-loop approval surface (for example, a Feishu
card that approves a spend or a publish), the permission mode becomes
surface-specific rather than global. The setting stays in `run-agent.ts`, so the
change is one file.
