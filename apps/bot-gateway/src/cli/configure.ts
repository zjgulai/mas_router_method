import { loadConfig } from '../config.js';
import { FeishuApiError, LarkGatewayClient } from '../feishu/client.js';

/**
 * Set the event subscription to long-connection mode and register the message
 * event via the Open Platform API. Requires `application:application:patch`.
 *
 * If the app does not have that scope yet, this prints the exact authorization
 * link instead of pretending it worked.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const client = new LarkGatewayClient(
    config,
    process.env['FEISHU_OPEN_BASE_URL'] ?? 'https://open.feishu.cn',
  );

  let canRead = false;
  try {
    const info = await client.getAppInfo();
    canRead = true;
    console.log('Current app config:');
    console.log(JSON.stringify(summariseAppInfo(info), null, 2));
  } catch (cause) {
    console.warn(`Could not read app config: ${describe(cause)}`);
  }

  try {
    await client.patchAppConfig({
      event: {
        subscription_type: 'websocket',
        add_events: ['im.message.receive_v1'],
      },
    });
    console.log('✓ event subscription set to websocket; im.message.receive_v1 added');
  } catch (cause) {
    console.error(`✗ patch failed: ${describe(cause)}`);
    const authUrl = `https://open.feishu.cn/app/${config.appId}/auth?q=application:application:patch,application:application:self_manage&op_from=openapi&token_type=tenant`;
    console.error(`Grant the self-management scope first: ${authUrl}`);
    process.exitCode = 1;
  }

  if (canRead) {
    try {
      const info = await client.getAppInfo();
      console.log('\nUpdated app config:');
      console.log(JSON.stringify(summariseAppInfo(info), null, 2));
    } catch {
      // The patch result is the signal; a read-back failure is not a second failure.
    }
  }

  console.log(`\nEvent console: https://open.feishu.cn/app/${config.appId}/event`);
  console.log('Then publish a version and add the bot to the group.');
}

function summariseAppInfo(info: unknown): unknown {
  if (typeof info !== 'object' || info === null) return info;
  const app = (info as { app?: Record<string, unknown> }).app;
  if (app === undefined) return info;
  return {
    app_id: app['app_id'],
    app_name: app['app_name'],
    scopes: app['scopes'],
    event: app['event'],
    callback: app['callback'],
    encryption: app['encryption'] === undefined ? undefined : '(configured)',
  };
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
