import { createHash, timingSafeEqual, createDecipheriv } from 'node:crypto';

/**
 * Feishu event-subscription verification.
 *
 * Two independent things happen before a Feishu event can be trusted, and they are
 * easy to conflate:
 *
 *   1. An `encrypt_key` may encrypt the whole body (AES-256-CBC, key derived by
 *      SHA-256 of the key string, IV = first 16 bytes of the ciphertext).
 *   2. A `verification_token` appears *inside* the payload and must match ours.
 *
 * Doing only the token check would let anyone who has seen one valid request
 * replay/forge a body; doing only decryption would accept any well-encrypted
 * garbage. Both are required, and both fail closed.
 */
export interface FeishuCryptoConfig {
  verificationToken: string;
  /** Optional. When set, the body is expected to be `{ encrypt: "..." }`. */
  encryptKey?: string;
}

export class FeishuVerificationError extends Error {
  override name = 'FeishuVerificationError';
}

/** Decrypt a `{encrypt: "..."}` envelope. Throws FeishuVerificationError on any failure. */
export function decryptEnvelope(envelope: { encrypt: string }, encryptKey: string): string {
  let key: Buffer;
  try {
    key = createHash('sha256').update(encryptKey, 'utf8').digest();
  } catch {
    throw new FeishuVerificationError('Could not derive the encryption key.');
  }

  const raw = Buffer.from(envelope.encrypt, 'base64');
  // AES-CBC needs at least one full IV block plus one byte of payload.
  if (raw.length <= 16) throw new FeishuVerificationError('Encrypted payload is too short.');

  const iv = raw.subarray(0, 16);
  const ciphertext = raw.subarray(16);

  try {
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    // Feishu pads with PKCS#7; node handles it unless the payload is corrupt.
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new FeishuVerificationError('Could not decrypt the payload — wrong encrypt key?');
  }
}

/**
 * Constant-time comparison. A plain `===` on a shared secret leaks its prefix
 * length through timing, which is a real attack against a public webhook.
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export type FeishuBody = Record<string, unknown>;

/**
 * Verify a raw request body and return the parsed event payload.
 *
 * Returns the *decoded* object, not the envelope: callers should never have to
 * remember which form they are holding. Handles both the url_verification
 * handshake (which carries a token but no encryption) and real events.
 */
export function parseFeishuBody(rawBody: string, config: FeishuCryptoConfig): FeishuBody {
  let parsed: FeishuBody;
  try {
    parsed = JSON.parse(rawBody) as FeishuBody;
  } catch {
    throw new FeishuVerificationError('Body is not valid JSON.');
  }

  let payload = parsed;
  if (typeof parsed['encrypt'] === 'string') {
    if (config.encryptKey === undefined) {
      throw new FeishuVerificationError('Body is encrypted but no encrypt key is configured.');
    }
    const decrypted = decryptEnvelope({ encrypt: parsed['encrypt'] }, config.encryptKey);
    try {
      payload = JSON.parse(decrypted) as FeishuBody;
    } catch {
      throw new FeishuVerificationError('Decrypted payload is not valid JSON.');
    }
  }

  const token = payload['token'] ?? (payload['header'] as { token?: string } | undefined)?.token;
  if (typeof token !== 'string' || !safeEqual(token, config.verificationToken)) {
    throw new FeishuVerificationError('Verification token mismatch.');
  }

  return payload;
}

/**
 * The handshake Feishu performs once, when the subscription URL is saved. Separate
 * from real events because it must be answered synchronously with a specific body,
 * before any agent work exists.
 */
export function urlVerificationChallenge(payload: FeishuBody): string | null {
  if (payload['type'] !== 'url_verification') return null;
  const challenge = payload['challenge'];
  return typeof challenge === 'string' ? challenge : null;
}
