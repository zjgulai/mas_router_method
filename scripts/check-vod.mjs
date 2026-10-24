#!/usr/bin/env node
/**
 * Host-side L1/L2 check for the magpie vod gateway.
 * Run this on the machine where magpie.app is listening, not inside the sandbox.
 *
 *   VOD_API_KEY=... node scripts/check-vod.mjs
 *   VOD_API_KEY=... node scripts/check-vod.mjs --base http://127.0.0.1:3425/v1
 */
import net from 'node:net';

const args = process.argv.slice(2);
const baseAt = args.indexOf('--base');
const base = (baseAt >= 0 ? args[baseAt + 1] : undefined) ?? 'http://127.0.0.1:3425/v1';
const url = new URL(base);

function tcpCheck(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    socket.setTimeout(1500);
    socket.once('connect', () => { socket.destroy(); resolve({ ok: true }); });
    socket.once('timeout', () => { socket.destroy(); resolve({ ok: false, error: 'timeout' }); });
    socket.once('error', (error) => resolve({ ok: false, error: error.code ?? error.message }));
  });
}

const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
console.log(`L1 gateway: ${url.hostname}:${port}`);
const tcp = await tcpCheck(url.hostname, port);
console.log(tcp.ok ? '  LISTENING' : `  NOT REACHABLE (${tcp.error})`);

const key = process.env.VOD_API_KEY;
if (!key) {
  console.log('L2 auth: skipped — VOD_API_KEY is not set');
  process.exit(tcp.ok ? 0 : 1);
}

console.log('L2 auth: GET /models');
try {
  const response = await fetch(`${base.replace(/\/$/, '')}/models`, {
    headers: { authorization: `Bearer ${key}` },
  });
  const text = await response.text();
  console.log(`  HTTP ${response.status}`);
  if (!response.ok) {
    console.log(`  ${text.slice(0, 300).replace(/\s+/g, ' ')}`);
    process.exit(1);
  }
  const payload = JSON.parse(text);
  const list = Array.isArray(payload) ? payload : (payload.data ?? payload.models ?? []);
  const ids = list.map((item) => item.id ?? item.ID ?? item.name).filter(Boolean);
  console.log(`  ${ids.length} model(s)`);
  const gemini = ids.filter((id) => /gemini/i.test(id));
  console.log(`  gemini ids: ${gemini.length === 0 ? 'none' : gemini.join(', ')}`);
  process.exit(0);
} catch (error) {
  console.log(`  failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
