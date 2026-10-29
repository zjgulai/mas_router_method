import type { MainAgentConfig } from '../config.js';

export interface MessagePayload {
  msgType: 'text' | 'interactive';
  /** JSON string. Feishu expects content to be a JSON-encoded string. */
  content: string;
}

export interface BotIdentity {
  openId?: string;
  name?: string;
}

export interface ChatSummary {
  chatId: string;
  name?: string;
  chatMode?: string;
  chatType?: string;
}

export interface FeishuGatewayClient {
  getBotIdentity(): Promise<BotIdentity>;
  reply(messageId: string, payload: MessagePayload): Promise<void>;
  send(chatId: string, payload: MessagePayload): Promise<void>;
}

export class FeishuApiError extends Error {
  override name = 'FeishuApiError';
  constructor(
    readonly code: number | undefined,
    readonly status: number,
    message: string,
    readonly logId?: string,
    readonly requiredScopes?: string[],
  ) {
    super(message);
  }
}

interface TokenResponse {
  code: number;
  msg: string;
  tenant_access_token?: string;
  expire?: number;
}

interface ApiEnvelope<T> {
  code: number;
  msg: string;
  data?: T;
  error?: {
    log_id?: string;
    permission_violations?: { subject?: string; type?: string }[];
  };
}

export class LarkGatewayClient implements FeishuGatewayClient {
  private token: { value: string; expiresAt: number } | undefined;
  private readonly baseUrl: string;

  constructor(
    private readonly config: Pick<MainAgentConfig, 'appId' | 'appSecret'>,
    baseUrl = 'https://open.feishu.cn',
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async getTenantToken(): Promise<string> {
    const now = Date.now();
    if (this.token !== undefined && this.token.expiresAt > now) return this.token.value;

    const response = await fetch(`${this.baseUrl}/open-apis/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ app_id: this.config.appId, app_secret: this.config.appSecret }),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = (await response.json()) as TokenResponse;
    if (payload.code !== 0 || payload.tenant_access_token === undefined) {
      throw new FeishuApiError(
        payload.code,
        response.status,
        `tenant_access_token: ${payload.msg}`,
      );
    }

    const expiresIn = payload.expire ?? 3600;
    this.token = {
      value: payload.tenant_access_token,
      // Refresh a minute early; a token that expires mid-request is a confusing 401.
      expiresAt: now + Math.max(60, expiresIn - 60) * 1000,
    };
    return this.token.value;
  }

  async getBotIdentity(): Promise<BotIdentity> {
    const payload = await this.request<{
      bot?: { open_id?: string; app_name?: string; activate_status?: number };
    }>('GET', '/open-apis/bot/v3/info');
    // `/bot/v3/info` returns `{ bot, code, msg }` rather than `{ data: { bot } }`.
    const bot =
      (payload as unknown as { bot?: { open_id?: string; app_name?: string } }).bot ??
      payload.data?.bot;
    return {
      ...(bot?.open_id !== undefined ? { openId: bot.open_id } : {}),
      ...(bot?.app_name !== undefined ? { name: bot.app_name } : {}),
    };
  }

  async reply(messageId: string, payload: MessagePayload): Promise<void> {
    await this.request('POST', `/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/reply`, {
      content: payload.content,
      msg_type: payload.msgType,
      reply_in_thread: true,
    });
  }

  async send(chatId: string, payload: MessagePayload): Promise<void> {
    await this.request('POST', '/open-apis/im/v1/messages?receive_id_type=chat_id', {
      receive_id: chatId,
      msg_type: payload.msgType,
      content: payload.content,
    });
  }

  async listChats(): Promise<ChatSummary[]> {
    const payload = await this.request<{
      items?: { chat_id: string; name?: string; chat_mode?: string; chat_type?: string }[];
    }>('GET', '/open-apis/im/v1/chats?page_size=100');

    return (payload.data?.items ?? []).map((item) => ({
      chatId: item.chat_id,
      ...(item.name !== undefined ? { name: item.name } : {}),
      ...(item.chat_mode !== undefined ? { chatMode: item.chat_mode } : {}),
      ...(item.chat_type !== undefined ? { chatType: item.chat_type } : {}),
    }));
  }

  /** Long-connection instance count; useful for the doctor command. */
  async getLongConnectionCount(): Promise<number | undefined> {
    const payload = await this.request<{ online_instance_cnt?: number }>(
      'GET',
      '/open-apis/event/v1/connection',
    );
    return payload.data?.online_instance_cnt;
  }

  /** Read the app's current scopes/events when the app has self-manage scope. */
  async getAppInfo(): Promise<unknown> {
    const payload = await this.request<unknown>(
      'GET',
      `/open-apis/application/v6/applications/${encodeURIComponent(this.config.appId)}?lang=zh_cn`,
    );
    return payload.data;
  }

  /** Update the subscription type and add events. Requires `application:application:patch`. */
  async patchAppConfig(body: Record<string, unknown>): Promise<void> {
    await this.request(
      'PATCH',
      `/open-apis/application/v7/applications/${encodeURIComponent(this.config.appId)}/config`,
      body,
    );
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body?: unknown,
  ): Promise<ApiEnvelope<T>> {
    const token = await this.getTenantToken();
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20_000),
    });

    let payload: ApiEnvelope<T>;
    try {
      payload = (await response.json()) as ApiEnvelope<T>;
    } catch {
      throw new FeishuApiError(undefined, response.status, `Non-JSON response from ${path}`);
    }

    if (payload.code !== 0) {
      const scopes = (payload.error?.permission_violations ?? [])
        .map((item) => item.subject)
        .filter((item): item is string => typeof item === 'string');
      throw new FeishuApiError(
        payload.code,
        response.status,
        `${path}: ${payload.msg}`,
        payload.error?.log_id,
        scopes,
      );
    }
    return payload;
  }
}
