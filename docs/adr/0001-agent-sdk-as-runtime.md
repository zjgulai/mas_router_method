# 0001. Use the Claude Agent SDK as the runtime rather than a hand-rolled loop

**Status:** accepted
**Date:** 2026-10-24

## Context

An agent product needs a loop: send messages, receive tool calls, execute them,
feed results back, enforce limits, stream progress, handle interruption. This is
well-understood and tedious. Writing it yourself is roughly 1,500 lines that
everyone writes slightly wrong.

The alternatives were: build the loop on the raw Messages API, use a low-code
platform, or build on the Agent SDK.

## Decision

Use `@anthropic-ai/claude-agent-sdk` and own only the parts that are ours: the
tools, the prompts, the schemas, the eval harness, and the product surfaces.

The SDK gives us tool-call handling, budget enforcement (`maxBudgetUsd`), session
persistence and resume, subagents, hooks, and in-process MCP servers via
`createSdkMcpServer` — the last of which is what makes our tools plain TypeScript
functions with closure access to application state, rather than a separate process.

## Consequences

**Easier:** shipping a working loop in days; streaming progress to the workbench;
running tools in-process against ports; resuming a conversation for a Feishu thread.

**Harder:** we are coupled to the SDK's release cadence, and its type surface
changes between minor versions. Mitigation: `run-agent.ts` is the *only* file that
imports from the SDK's runtime API. Everything else speaks our own types. Swapping
runtimes means rewriting one file, not the product.

**Accepted:** the SDK spawns a subprocess and ships a large platform binary per
architecture (133 MB for linux-arm64 in the version we pinned). This is fine for a
server deployment and inconvenient for CI; the eval job runs on Linux, which is
where the binary matters.

**Accepted:** `result.total_cost_usd` is a client-side estimate, not a billing
statement. Our own cost accounting uses it for budget enforcement, which is correct
for stopping runaway runs but must not be used for invoicing.

## What we would revisit

If we needed a model other than Claude, or a loop with fundamentally different
semantics (e.g. multi-agent debate as the primary structure), the single-file
coupling makes the swap tractable. That was the point of the constraint.
