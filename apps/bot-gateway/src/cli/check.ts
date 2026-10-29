import { MainConsultAgent } from '@mas/consult';
import { loadConfig } from '../config.js';
import { LarkGatewayClient, FeishuApiError } from '../feishu/client.js';

/**
 * Read-only doctor. It never sends a message.
 *
 * Exit 0 means: credentials work, the bot is reachable, the knowledge corpus
 * loads, and the agent can answer a canonical question. Missing chat/message
 * scopes are reported as warnings because the event subscription may still work
 * once the operator grants them.
 */
async function main(): Promise<void> {
  const report: Record<string, unknown> = {};

  let config;
  try {
    config = loadConfig();
  } catch (cause) {
    console.error(`config error: ${cause instanceof Error ? cause.message : String(cause)}`);
    console.error('\nSet FEISHU_APP_ID and FEISHU_APP_SECRET in .env, then retry.');
    process.exit(1);
  }

  report['mode'] = config.mode;
  report['appId'] = config.appId;

  const client = new LarkGatewayClient(
    config,
    process.env['FEISHU_OPEN_BASE_URL'] ?? 'https://open.feishu.cn',
  );

  let critical = false;

  try {
    await client.getTenantToken();
    console.log('✓ tenant_access_token acquired');
  } catch (cause) {
    critical = true;
    console.error(`✗ tenant_access_token: ${describe(cause)}`);
  }

  let identity;
  try {
    identity = await client.getBotIdentity();
    console.log(`✓ bot identity: ${identity.name ?? '(unknown)'} ${identity.openId ?? ''}`);
    report['bot'] = identity;
  } catch (cause) {
    critical = true;
    console.error(`✗ bot info: ${describe(cause)}`);
  }

  try {
    const count = await client.getLongConnectionCount();
    console.log(`• long-connection instances: ${count ?? 'unknown'}`);
    report['longConnectionInstances'] = count;
  } catch (cause) {
    console.warn(`• long-connection status unavailable: ${describe(cause)}`);
  }

  try {
    const chats = await client.listChats();
    console.log(`✓ bot is in ${chats.length} chat(s)`);
    for (const chat of chats.slice(0, 10)) {
      console.log(`  - ${chat.name ?? '(no name)'} ${chat.chatId}`);
    }
    report['chats'] = chats.length;
  } catch (cause) {
    console.warn(
      `• chat list unavailable (usually a missing im:chat:readonly scope): ${describe(cause)}`,
    );
  }

  try {
    const agent = MainConsultAgent.fromRepo({
      root: config.knowledgeRoot,
      maxChars: config.maxAnswerChars,
      llm: null,
    });
    const answer = await agent.answer('区域间声量相关性 0.9 还能做归因吗？');
    console.log(
      `✓ agent answered: node=${answer.nodeId ?? 'none'} confidence=${answer.confidence} chars=${answer.text.length}`,
    );
    report['agent'] = {
      nodeId: answer.nodeId,
      confidence: answer.confidence,
      chars: answer.text.length,
      sources: answer.sources.slice(0, 3).map((source) => source.path),
    };
    if (answer.outOfScope) {
      critical = true;
      console.error('✗ canonical question was classified as out of scope');
    }
  } catch (cause) {
    critical = true;
    console.error(`✗ agent: ${describe(cause)}`);
  }

  const authUrl = `https://open.feishu.cn/app/${config.appId}/auth?q=im:message,im:message:send_as_bot,im:message.group_msg,im:message.p2p_msg,im:chat:readonly,application:application:patch&op_from=openapi&token_type=tenant`;
  const eventUrl = `https://open.feishu.cn/app/${config.appId}/event`;

  console.log('\nNext, if something is missing:');
  console.log(`  1. Grant scopes: ${authUrl}`);
  console.log(`  2. Add event im.message.receive_v1 and choose 长连接: ${eventUrl}`);
  console.log('  3. Publish a version, add the bot to the group, then @ it.');
  console.log('  4. Run: pnpm --filter @mas/bot-gateway dev');

  report['critical'] = critical;
  console.log(`\n${JSON.stringify(report, null, 2)}`);
  process.exit(critical ? 1 : 0);
}

function describe(cause: unknown): string {
  if (cause instanceof FeishuApiError) {
    const scopes = cause.requiredScopes?.length
      ? ` (requires: ${cause.requiredScopes.join(', ')})`
      : '';
    return `[${cause.code ?? cause.status}] ${cause.message}${scopes}`;
  }
  return cause instanceof Error ? cause.message : String(cause);
}

void main().catch((cause: unknown) => {
  console.error(describe(cause));
  process.exit(1);
});
