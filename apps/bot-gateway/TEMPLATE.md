# bot-gateway v1.1 — the template for an expert bot

This gateway is the scaffold the PMO's Wave 2/3 bots copy. It owns transport,
idempotency, queueing, card callbacks, and evidence. It owns no agent logic: the
consult/recipe brain is injected, so the same gateway serves a different expert
by replacing the agent and the card formatter.

## What to copy

| File                                        | Why it is reusable                                 |
| ------------------------------------------- | -------------------------------------------------- |
| `src/feishu/client.ts`                      | tenant token, reply/send, identity, error scopes   |
| `src/feishu/normalize.ts`                   | @-mention matching by open id, then name           |
| `src/session.ts`                            | thread/root/p2p session keys, in-memory + SQLite   |
| `src/telemetry.ts`                          | questions, answers, card actions, error evidence   |
| `src/card-action.ts`                        | action-id registry, toast/card response            |
| `src/handler.ts`                            | dedupe, allow-list, queue, card callback, evidence |
| `src/http.ts` / `src/ws.ts`                 | webhook and long-connection transports             |
| `src/cli/check.ts` / `src/cli/telemetry.ts` | doctor and Stage 3 readout                         |

Replace `src/feishu/recipe-format.ts` with your own card. Keep the card's
`action.value.action_id` and `recipe_id` (or your domain id) shape so the
registry and the ledger stay generic.

## Feishu app setup

- Events: `im.message.receive_v1`.
- Callbacks: `card.action.trigger`, pointed at the same request URL as the events.
- Permissions: `im:message`, `im:message:send_as_bot`.
- WS mode needs no public URL. HTTP mode needs `FEISHU_VERIFICATION_TOKEN`.

## Environment

| Variable                              | Default                         | Purpose                            |
| ------------------------------------- | ------------------------------- | ---------------------------------- |
| `FEISHU_APP_ID` / `FEISHU_APP_SECRET` | required                        | the expert's own app               |
| `FEISHU_EVENT_MODE`                   | `ws`                            | `ws` or `http`                     |
| `FEISHU_VERIFICATION_TOKEN`           | -                               | required for `http`                |
| `MAIN_AGENT_SESSION_DB`               | `.data/main-agent-sessions.db`  | thread sessions                    |
| `MAIN_AGENT_TELEMETRY_DB`             | `.data/main-agent-telemetry.db` | Stage 3 evidence                   |
| `MAIN_AGENT_TELEMETRY`                | `true`                          | `false` disables the evidence file |
| `MAIN_AGENT_GROUP_MODE`               | `mention`                       | `all` answers every group message  |

## Three rules

1. **Return within three seconds.** Messages enqueue and return; card callbacks
   are synchronous (SQLite + registry) because Feishu waits for the response.
2. **Every inbound event has an idempotency key.** Messages use `event_id` then
   `message_id`; card actions use `event_id`, or `messageId + operator + actionId`
   when Feishu omits it. The ledger's `UNIQUE(event_id)` is the second guard.
3. **If it is not in SQLite, Stage 3 cannot be claimed.** A question that is not
   in `events` does not exist for the weekly frequency count.

## Add an action

```ts
const registry = new CardActionRegistry()
  .register('recipe.adopt', () => ({ toast: { type: 'success', content: '已记录采纳' } }))
  .register('recipe.revise', () => ({ toast: { type: 'info', content: '已记录修改意向' } }));
```

Pass it to `MainAgentHandler({ cardActions: registry })`. The button's `value`
must carry `action_id` (and your domain id, here `recipe_id`). An unknown id gets
a warning toast, not an exception.

## Read the evidence

```bash
pnpm --filter @mas/bot-gateway telemetry top --days 7
pnpm --filter @mas/bot-gateway telemetry stats --days 7
```

`top` groups by a normalised question hash and prints count, last seen, and the
question text. `stats` prints messages, answers, card actions, errors, distinct
chats, and distinct questions.

## Stage mapping

- **Stage 2**: a card click writes one `card_actions` row and returns a toast.
  The row is the "button produced a task" evidence the PMO rubric asks for.
- **Stage 3**: `events` rows feed `topQuestions`; a question at ≥10/week for two
  consecutive weeks is the trigger to distil an SOP. Do not claim Stage 3 from
  logs that only exist in memory.
- **Stage 4**: migrate the stable SOP to the workbench; the gateway keeps the
  evidence trail, not the automation.
