import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  FeishuVerificationError,
  decryptEnvelope,
  parseFeishuBody,
  urlVerificationChallenge,
} from './verify.js';

/** Mirrors what Feishu actually sends, so the test cannot pass against a wrong assumption. */
function encryptForTest(plaintext: string, encryptKey: string): string {
  const key = createHash('sha256').update(encryptKey, 'utf8').digest();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, encrypted]).toString('base64');
}

const CONFIG = { verificationToken: 'tok_abc123', encryptKey: 'enc_key_xyz' };

describe('parseFeishuBody', () => {
  it('accepts an unencrypted body with a matching token', () => {
    const body = JSON.stringify({ token: 'tok_abc123', type: 'url_verification', challenge: 'c1' });
    expect(parseFeishuBody(body, CONFIG)['challenge']).toBe('c1');
  });

  it('rejects a wrong token', () => {
    const body = JSON.stringify({ token: 'wrong', type: 'event' });
    expect(() => parseFeishuBody(body, CONFIG)).toThrow(FeishuVerificationError);
  });

  it('decrypts an envelope and then checks the inner token', () => {
    const inner = JSON.stringify({ token: 'tok_abc123', header: { event_id: 'e1' } });
    const body = JSON.stringify({ encrypt: encryptForTest(inner, 'enc_key_xyz') });
    const parsed = parseFeishuBody(body, CONFIG);
    expect((parsed['header'] as { event_id: string }).event_id).toBe('e1');
  });

  it('rejects an encrypted body when no key is configured', () => {
    const body = JSON.stringify({ encrypt: 'anything' });
    expect(() => parseFeishuBody(body, { verificationToken: 'tok_abc123' })).toThrow(
      /no encrypt key is configured/,
    );
  });

  it('rejects an encrypted body that decrypts to a bad token', () => {
    const inner = JSON.stringify({ token: 'wrong' });
    const body = JSON.stringify({ encrypt: encryptForTest(inner, 'enc_key_xyz') });
    expect(() => parseFeishuBody(body, CONFIG)).toThrow(/token mismatch/);
  });

  it('rejects malformed JSON rather than throwing a SyntaxError upward', () => {
    expect(() => parseFeishuBody('not json', CONFIG)).toThrow(FeishuVerificationError);
  });

  it('rejects a truncated ciphertext instead of crashing', () => {
    expect(() => decryptEnvelope({ encrypt: 'AAAA' }, 'enc_key_xyz')).toThrow(
      /too short/,
    );
  });
});

describe('urlVerificationChallenge', () => {
  it('extracts the challenge from the handshake', () => {
    expect(urlVerificationChallenge({ type: 'url_verification', challenge: 'abc' })).toBe('abc');
  });

  it('returns null for a real event', () => {
    expect(urlVerificationChallenge({ header: { event_id: 'e1' } })).toBeNull();
  });
});
