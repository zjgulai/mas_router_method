# Main agent gateway

Feishu surface for the capability-graph consultant. It answers group and direct
messages with grounded, cited advice about data products and Agent Native builder
work. The consulting logic lives in `@mas/consult`; this app owns transport,
identity, idempotency, queueing, and delivery.

## Quick start

```bash
# from the repo root
pnpm --filter @mas/bot-gateway check      # read-only doctor
pnpm --filter @mas/bot-gateway simulate -- "区域间声量相关性 0.9 还能做归因吗？"
pnpm --filter @mas/bot-gateway dev        # long connection, default
```

`check` never sends a message. It verifies the tenant token, bot identity, long
connection count, chat list (when permitted), and one canonical answer.

## Modes

| Mode            | Env                      | Use                                     |
| --------------- | ------------------------ | --------------------------------------- |
| Long connection | `FEISHU_EVENT_MODE=ws`   | Local development; no public URL        |
| Webhook         | `FEISHU_EVENT_MODE=http` | Production behind HTTPS; `POST /events` |

In webhook mode, set `FEISHU_VERIFICATION_TOKEN` (and `FEISHU_ENCRYPT_KEY` if
encryption is on). The server answers the URL challenge and returns `200` before
the agent runs; Feishu retries a slow handler, so the queue does the work.

## Required Feishu configuration

1. Bot capability enabled.
2. Event `im.message.receive_v1` added.
3. Subscription mode set to long connection, or the webhook URL registered.
4. Scopes:
   - `im:message`
   - `im:message:send_as_bot`
   - `im:message.group_msg`（读取群消息；群里接收事件更稳）
   - `im:message.p2p_msg`（读取单聊消息）
   - `im:chat:readonly` (optional; chat list and doctor)
   - `application:application:patch` (optional; `configure` can set the event subscription)
5. A version published and the bot added to the group.

`python3 scripts/feishu-onboard.py` prints a one-click authorization link,
waits for confirmation, then sets the subscription to `websocket` and adds
`im.message.receive_v1`.

## Behaviour

- Group messages are answered only when the bot is mentioned, unless
  `MAIN_AGENT_GROUP_MODE=all`.
- Mention matching uses the bot's `open_id`, not "any mention". Mentioning someone
  else does not trigger a reply.
- `event_id` and `message_id` are deduplicated for 10 minutes.
- The agent runs in a per-chat serial queue with a global concurrency cap.
- A reply is sent to the original message; if that fails, the gateway falls back
  to sending to the chat.
- Answers longer than `MAIN_AGENT_MAX_ANSWER_CHARS` are split at paragraph or
  sentence boundaries and numbered.
- `sender_type=app` is ignored, so the bot cannot reply to itself.

## Answer shape

Every answer contains:

```text
【结论】what to do
【定位】which capability node
【依据】2–3 quoted lines from the repo
【下一步】numbered, executable actions
【边界】what this advice cannot answer
【证据】file paths + headings
```

If the question is outside the graph, the agent says so and lists the kinds of
questions it can answer. It does not improvise.

## Environment

See `.env.example` for the full list. The important ones:

```bash
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_EVENT_MODE=ws
FEISHU_BOT_NAME=Main
MAIN_AGENT_GROUP_MODE=mention
MAIN_AGENT_MAX_ANSWER_CHARS=3400
MAIN_AGENT_LLM=auto        # off | auto | anthropic | openai
MAIN_AGENT_ACK_AFTER_MS=4000
BOT_GATEWAY_PORT=3001
```

`MAIN_AGENT_LLM=auto` uses `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` if present;
otherwise the deterministic grounded answer ships. The model may rewrite the
answer but may not add facts, commands, or citations. If synthesis fails, the
grounded answer is used.

## Endpoints (HTTP mode)

| Method | Path       | Purpose                               |
| ------ | ---------- | ------------------------------------- |
| `POST` | `/events`  | Feishu event callback + URL challenge |
| `GET`  | `/healthz` | Uptime, queue, counters, last error   |
| `GET`  | `/readyz`  | Readiness                             |
| `GET`  | `/`        | Plain-text hint                       |

## Tests

```bash
pnpm --filter @mas/bot-gateway test
```

39 tests: config, idempotency, queue, mention matching, allow-lists, reply
fallback, long-answer splitting, HTTP challenge/validation, and the handler path.

## Known limits

- Idempotency is in-memory. A restart can allow a Feishu retry to be processed
  again; use a persistent store before running multiple instances.
- Long connection is cluster-mode: with multiple clients, only one receives each
  event. Use webhook + shared state for horizontal scaling.
- No multi-turn session yet. Each message is answered independently.
- The allow-list is static configuration; there is no per-user capability tier.

## Troubleshooting

If the message is visible in Feishu but the gateway does not answer:

1. Look for `ws event received` in the log. If it is absent, the event did not reach the socket: check the subscription mode in the developer console (it must be **long connection**) and the published version's event list.
2. If `ws event received` is present but there is no `question received`, look for `not addressed to this bot`. The gateway matches the bot's `open_id`, not "any mention"; mentioning another user should not trigger a reply.
3. If the payload shape changed, `ws raw event` (debug level) prints the first 4,000 characters. Mention `id` is accepted as either a bare open_id string or `{ open_id }`.
4. To answer a message that was missed, replay it through the real handler:
   ```bash
   pnpm --filter @mas/bot-gateway replay -- \
     --message-id om_xxx --chat-id oc_xxx \
     --sender ou_xxx --text "你的问题"
   ```
   This sends the answer as a reply in the original thread.

Set `MAIN_AGENT_LOG_LEVEL=debug` to see raw events and ignore reasons.

## Real-question eval

```bash
pnpm --filter @mas/bot-gateway eval:real
```

Runs the 30 real group questions in `packages/consult/data/eval/main-agent-cases.json`
through the same agent the gateway uses. It writes:

- `packages/consult/data/eval/main-agent-real-results.jsonl` — per-case answer, node, checks
- `packages/consult/data/eval/main-agent-real-summary.json` — pass rate + manual verdicts
- `docs/evals/main-agent-real-qa.md` — human-readable report

The automated gate is currently 0.75; the manual verdict column is the honest
quality signal. Do not delete a failing real question to make the suite green.
