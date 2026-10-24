import { LIMITS } from './limits.js';

/**
 * Fetch a page and return its HTML.
 *
 * The size cap is enforced *while reading*, not after: a `Content-Length` check
 * alone lets a chunked response of arbitrary size into memory, which is exactly
 * how a "protected" tool falls over on one hostile URL.
 */
export async function fetchPage(url, options = {}) {
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? LIMITS.fetchTimeoutMs;
  const maxBytes = options.maxBytes ?? LIMITS.maxResponseBytes;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Not a URL: ${url}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Only http and https are supported, got ${parsed.protocol}`);
  }

  let response;
  try {
    response = await doFetch(parsed.toString(), {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': 'link-digest/1.0 (+small tool)' },
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Could not fetch ${parsed.hostname}: ${message}`);
  }

  if (!response.ok) {
    throw new Error(`${parsed.hostname} returned HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!/text\/html|application\/xhtml|text\/plain/i.test(contentType)) {
    throw new Error(`Not a web page (${contentType || 'no content-type'})`);
  }

  // Stream and stop at the cap.
  const reader = response.body?.getReader();
  if (reader === undefined) {
    const text = await response.text();
    return { html: text.slice(0, maxBytes), bytes: text.length, truncated: text.length > maxBytes, finalUrl: response.url || parsed.toString(), contentType };
  }

  const chunks = [];
  let bytes = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value === undefined) continue;
    const room = maxBytes - bytes;
    if (room <= 0) { truncated = true; break; }
    if (value.byteLength > room) {
      chunks.push(value.subarray(0, room));
      bytes += room;
      truncated = true;
      break;
    }
    chunks.push(value);
    bytes += value.byteLength;
  }
  try { await reader.cancel(); } catch { /* already closed */ }

  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }

  return {
    html: new TextDecoder('utf-8', { fatal: false }).decode(merged),
    bytes,
    truncated,
    finalUrl: response.url || parsed.toString(),
    contentType,
  };
}
