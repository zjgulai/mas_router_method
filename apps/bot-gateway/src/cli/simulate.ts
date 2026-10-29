import { MainConsultAgent } from '@mas/consult';
import { loadConfig } from '../config.js';
import { createLogger } from '../logger.js';
import { MainAgentHandler } from '../handler.js';
import type { BotIdentity, FeishuGatewayClient, MessagePayload } from '../feishu/client.js';

/**
 * Local end-to-end simulation: event -> normalise -> queue -> agent -> reply.
 *
 *   pnpm --filter @mas/bot-gateway simulate -- "区域间声量相关性 0.9 还能做归因吗？"
 *
 * No Feishu call is made. Use this to check answer shape before wiring a group.
 */
const question = process.argv.slice(2).join(' ').trim() || '区域间声量相关性 0.9 还能做归因吗？';

class PrintClient implements FeishuGatewayClient {
  async getBotIdentity(): Promise<BotIdentity> {
    return { openId: 'ou_main', name: 'Main' };
  }

  async reply(messageId: string, payload: MessagePayload): Promise<void> {
    const body = JSON.parse(payload.content) as { text?: string; [key: string]: unknown };
    console.log(`\n[reply to ${messageId}]`);
    console.log(body.text ?? JSON.stringify(body, null, 2));
  }

  async send(chatId: string, payload: MessagePayload): Promise<void> {
    console.log(`\n[send to ${chatId}]`);
    console.log(JSON.parse(payload.content));
  }
}

const base = loadConfig();
const config = { ...base, ackAfterMs: 0 };
const agent = MainConsultAgent.fromRepo({
  root: config.knowledgeRoot,
  maxChars: config.maxAnswerChars,
  llm: null,
});

const handler = new MainAgentHandler({
  config,
  client: new PrintClient(),
  agent,
  identity: { openId: 'ou_main', name: 'Main' },
  logger: createLogger('error'),
});

handler.handleMessage({
  eventId: 'ev_sim',
  messageId: 'om_sim',
  chatId: 'oc_sim',
  chatType: 'group',
  senderOpenId: 'ou_user',
  text: question,
  addressedToBot: true,
  mentionedOpenIds: ['ou_main'],
  mentionedNames: ['Main'],
});

await handler.drain();
console.log('\n[stats]', JSON.stringify(handler.stats()));
