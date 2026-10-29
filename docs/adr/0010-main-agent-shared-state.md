# 0010 — Main agent shared state before a second instance

**Status**: Proposed
**Date**: 2026-10-29

## Context

The Feishu gateway currently runs as one process:

- Thread sessions are persisted in SQLite at `.data/main-agent-sessions.db`.
- Idempotency is an in-process TTL set (`TtlSet`).
- The per-chat queue is in-process (`ChatQueue`).

That is sufficient for one long-connection instance and survives a process
restart for sessions. It does **not** survive a second instance:

1. Two instances receive or retry the same event; each has its own idempotency
   set, so the user gets two answers.
2. A thread reply can land on instance B while the history lives in instance A's
   SQLite file; the follow-up loses context.
3. The queue is per-process; there is no global concurrency limit, no fair
   scheduling, and no way to see which instance owns a `task_id`.

ADR 0006 already decided "SQLite now, Postgres before the bot" for the main
product's `RunStore`. This ADR extends that decision to the Main agent's state
and sets the gate for running more than one gateway.

## Decision

Before running more than one gateway instance, move three pieces of state to a
shared Postgres database (or an equivalent shared store with the same
guarantees):

| State | Contract | Key / conflict rule |
|---|---|---|
| Sessions | `get(key) -> turns[]`, `append(key, turn)`, `clear(key)`, TTL | `key` primary key; `expires_at` index |
| Idempotency | `claim(eventId) -> boolean`, TTL | unique `(app_id, event_id)`; insert wins once |
| Queue | `enqueue(chatId, messageId, payload)`, `claim(workerId)`, `ack(id)` | `(chat_id, message_id)` unique; `FOR UPDATE SKIP LOCKED` |

Rules:

- **One answer per event, globally.** Idempotency is a database insert, not a
  process-local set. A duplicate event returns `already_claimed` and is dropped.
- **Session key is stable across instances.** `thread > root > p2p chat`, exactly
  as `sessionKeyFor()` does today. Top-level group messages still start fresh.
- **Per-chat serial, global bounded.** `chat_id` is the serialization key; a
  worker claims one pending row per chat, up to `MAIN_AGENT_CONCURRENCY` across
  all chats. This preserves today's `ChatQueue` behavior.
- **TTL is storage-enforced.** Reads must treat expired rows as absent; a
  background sweep is an optimization, not a correctness requirement.
- **SQLite remains the local/dev adapter.** The interface is identical; tests run
  against SQLite in memory and against Postgres only in the integration job.

## Consequences

**Good**

- Duplicate Feishu retries cannot produce duplicate answers.
- A thread follow-up can be answered by any instance.
- Queue depth, ownership, and failures become observable from one table.
- The single-instance deployment keeps working with SQLite; no forced migration.

**Costs**

- A new operational dependency (Postgres) and a migration path.
- At-least-once delivery still requires idempotent handlers; the queue is not a
  replacement for `claim(eventId)`.
- Retention/privacy policy must cover the session table (message text), not just
  logs. Default TTL stays 30 minutes; do not dump sessions into analytics.

## Migration plan

1. Extract the three interfaces alongside `SessionStoreLike`; keep in-memory and
   SQLite adapters as the reference implementations.
2. Add the Postgres schema and run the existing gateway test suite against it in
   CI (containerized Postgres).
3. Dual-write sessions and idempotency in staging; compare reads for one week.
4. Run two staging instances, replay a duplicate event, and a thread follow-up
   that crosses instances; both must pass before production.
5. Switch production to Postgres, keep SQLite for local dev, and add a startup
   assertion that refuses `>1` instance when the store is not shared.

## Not doing now

- Redis, Kafka, or a custom relay service. Postgres already exists in the product
  direction (ADR 0006); adding another dependency before it is needed is worse.
- Multi-region or active-active. The first goal is "two instances in one region
  do not double-reply or lose thread context."
- Changing the Feishu transport. Long connection stays the default; webhook +
  shared state is the production alternative.
