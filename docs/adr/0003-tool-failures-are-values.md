# 0003. Tool failures are values, never exceptions

**Status:** accepted
**Date:** 2026-10-24

## Context

In the Agent SDK, a tool handler that throws terminates the whole query. A handler
that returns `{ isError: true }` lets the model see the failure and try something
else.

Most failures in this product are *expected*: a TikTok URL that 404s, a brand
without guardrails configured, a vision call that times out. None of these should
end a run that may already have cost a dollar and twenty turns of context.

## Decision

Every tool returns a `ToolOutcome`: `ok(text, data)` or `err(text, retryable)`.
`packages/core/src/tools/result.ts` owns the shape and the conversion to the MCP
result format. `guard()` wraps a tool body so an unexpected throw degrades into a
non-retryable error instead of killing the run.

`retryable` is part of the error, not a message convention. `false` means the input
was wrong and retrying verbatim fails identically; `true` means a different approach
might work. The model uses this to decide whether to retry, and the workbench uses
it to decide whether to offer a retry button.

## Consequences

**Easier:** a run survives a bad tool call, which is the common case; failures are
visible in the run's steps with a reason; the workbench can distinguish "you gave
me a bad link" from "our vision service is down", which are very different messages
to a user.

**Harder:** error paths are now explicit code in every tool rather than a
try/catch at the top. That is the point — it forces each tool author to decide
whether retrying could help, which is a product decision, not an implementation
detail.

**Rule that follows from it:** never `throw` from a tool. If you find yourself
wanting to, the question to answer first is whether the failure is retryable. If
you cannot answer that, you do not yet understand the failure.

**Accepted:** a bug in our own code (a `TypeError` from a bad access) also becomes
a visible tool error rather than a loud crash. This trades discoverability in
development for resilience in production. The mitigation is that `guard()` marks
such errors non-retryable and includes "Tool crashed:", so they are greppable in
run logs.
