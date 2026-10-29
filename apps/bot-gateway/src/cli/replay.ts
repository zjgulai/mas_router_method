import { MainConsultAgent } from '@mas/consult';
import { loadConfig } from '../config.js';
import { createLogger } from '../logger.js';
import { MainAgentHandler } from '../handler.js';
import { LarkGatewayClient } from '../feishu/client.js';

/**
 * Replay one Feishu message through the real gateway path.
 *
 * Use this when an event was missed (subscription misconfiguration, gateway was
 * down, etc.). It builds the same normalised message the gateway would build,
 * runs the agent, and replies to the original message in the chat.
 *
 *   pnpm --filter @mas/bot-gateway replay -- \
 *     --message-id om_xxx --chat-id oc_xxx --sender ou_xxx \
 *     --text "全栈 Agent Native builder 的开发流程是？"
 */
function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

const messageId = arg('message-id');
const chatId = arg('chat-id');
const text = arg('text');
if (messageId === undefined || chatId === undefined || text === undefined) {
  console.error('usage: replay --message-id <om_...> --chat-id <oc_...> --text "<question>"');
  process.exit(1);
}

const base = loadConfig();
const config = { ...base, ackAfterMs: 0 };
const logger = createLogger(config.logLevel);
const client = new LarkGatewayClient(
  config,
  process.env['FEISHU_OPEN_BASE_URL'] ?? 'https://open.feishu.cn',
);
const identity = await client.getBotIdentity();
const agent = MainConsultAgent.fromRepo({
  root: config.knowledgeRoot,
  maxChars: config.maxAnswerChars,
  llm: null,
});

const handler = new MainAgentHandler({
  config,
  client,
  agent,
  identity,
  logger,
});

handler.handleMessage({
  eventId: arg('event-id') ?? `replay_${Date.now()}`,
  messageId,
  chatId,
  chatType: 'group',
  senderOpenId: arg('sender') ?? 'replay',
  text,
  addressedToBot: true,
  mentionedOpenIds: identity.openId !== undefined ? [identity.openId] : [],
  mentionedNames: identity.name !== undefined ? [identity.name] : [],
});

await handler.drain();
console.log(JSON.stringify(handler.stats(), null, 2));
