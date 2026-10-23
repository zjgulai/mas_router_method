/**
 * Feishu bot gateway.
 *
 * Deliberately thin. It owns three things — verifying a request came from Feishu,
 * turning an event into an agent request, and delivering the result — and no agent
 * logic at all. Everything about *what* the agent does lives in `@mas/core`, so the
 * same behaviour is reachable from the workbench without reimplementation.
 */
export {};

const PORT = Number(process.env['BOT_GATEWAY_PORT'] ?? 3001);

/**
 * Placeholder entrypoint. The HTTP server, idempotency store, and Feishu delivery
 * land with milestone 2 (`docs/roadmap.md`); building them now, before there is a
 * recipe to deliver, would be a horizontal slice that demos nothing.
 *
 * What this file will need, so it is not discovered by accident later:
 *   - POST /events         verify -> normalise -> enqueue -> 200 immediately
 *   - GET  /healthz        for the deploy platform
 *   - an idempotency check on event_id, because Feishu retries
 *   - a run queue, because a run outlives Feishu's timeout by a wide margin
 */
export const config = {
  port: PORT,
  hasVerificationToken: Boolean(process.env['FEISHU_VERIFICATION_TOKEN']),
} as const;

if (process.env['NODE_ENV'] !== 'test') {
  // eslint-disable-next-line no-console
  console.log(
    `bot-gateway starting on :${config.port} — event handling arrives in milestone 2`,
  );
}
