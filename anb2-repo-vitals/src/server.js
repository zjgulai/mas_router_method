import { createServer } from 'node:http';
import { parseRepo, fetchRepoFacts, GitHubError } from './github.js';
import { assess, headline } from './verdict.js';
import { createMetrics } from './metrics.js';

/**
 * The web surface.
 *
 * Deliberately one file and no framework: the point of this stage is that a
 * stranger can open it, not that it is extensible. What matters is that every
 * failure a stranger can cause produces a readable sentence rather than a stack
 * trace, because an unreadable failure is indistinguishable from a broken page.
 */

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

/**
 * Process-lifetime counters. Reset on restart; the page says so.
 *
 * Created lazily and replaceable so a test can start from zero. A module-level
 * singleton is correct for the running server and wrong for anything that wants
 * to assert on counts — the first metrics test failed by inheriting another test
 * file's numbers, which is a real instance of the same bug this stage is about.
 */
let metrics = createMetrics();
export function resetMetrics() { metrics = createMetrics(); }

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LEVEL_CLASS = { good: 'lv-good', warn: 'lv-warn', bad: 'lv-bad', unknown: 'lv-unknown' };

function page(body, status = 200) {
  return {
    status,
    html: `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>repo-vitals</title>
<style>
  :root{color-scheme:light;--bg:#f2f1ec;--card:#fbfaf6;--ink:#191a17;--mut:#54564f;--faint:#5f6159;
        --line:#d6d5cc;--ok:#0d5a51;--warn:#6b5312;--bad:#782c2c;--grey:#5f6159;
        --sans:ui-sans-serif,-apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",sans-serif;
        --serif:ui-serif,Georgia,"Songti SC",serif;--mono:ui-monospace,SFMono-Regular,Menlo,monospace}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 var(--sans)}
  .w{max-width:760px;margin:0 auto;padding:clamp(24px,6vw,64px) 20px 80px}
  h1{font-family:var(--serif);font-weight:600;font-size:clamp(1.7rem,5vw,2.5rem);letter-spacing:-.02em;margin:0 0 .5rem;line-height:1.1}
  .sub{color:var(--mut);margin:0 0 2rem;font-size:1.02rem}
  form{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:2rem}
  input[type=text]{flex:1;min-width:220px;padding:13px 15px;border:0;background:var(--card);
    font:inherit;color:var(--ink);border-radius:0}
  input[type=text]:focus{outline:2px solid var(--ok);outline-offset:-2px}
  button{padding:13px 22px;border:0;background:var(--ok);color:#f8fbf9;font:inherit;font-weight:600;cursor:pointer;border-radius:0}
  button:hover{background:#0a4a43}
  .card{background:var(--card);padding:1.4rem 1.5rem;margin-bottom:1px}
  .head{font-family:var(--serif);font-size:1.22rem;line-height:1.35;margin:0 0 .35rem}
  .meta2{font-family:var(--mono);font-size:.8rem;color:var(--faint);margin:0 0 1.2rem}
  table{border-collapse:collapse;width:100%}
  td{padding:.6rem .5rem;border-bottom:1px solid #e7e6df;vertical-align:top;font-size:.9rem;color:var(--mut)}
  tr:last-child td{border-bottom:0}
  td.lvl{width:5.5rem;font-family:var(--mono);font-size:.75rem;font-weight:650;text-transform:uppercase}
  td.nm{width:8rem;color:var(--ink);font-weight:600}
  .lv-good{color:var(--ok)} .lv-warn{color:var(--warn)} .lv-bad{color:var(--bad)} .lv-unknown{color:var(--grey)}
  .blind{display:block;font-size:.8rem;color:var(--faint);margin-top:.2rem}
  .nm-list{margin:.5rem 0 0;padding-left:1.1rem;font-size:.88rem;color:var(--mut)}
  .nm-list li{margin-bottom:.25rem}
  .err{background:#eedcd8;color:#4a1e1e;padding:1.1rem 1.3rem;font-size:.95rem}
  .err b{color:#2e1111}
  .hint{font-size:.85rem;color:var(--faint);margin-top:1.5rem}
  a{color:var(--ok);text-decoration:none;border-bottom:1px solid currentColor;word-break:break-all;font-size:.8rem}
  .src{margin:.5rem 0 0;padding-left:1.1rem}
  .src li{margin-bottom:.3rem;list-style:none}
  @media print{body{background:#fff}}
</style></head><body><div class="w">${body}</div></body></html>`,
  };
}

function searchPage(message = '', value = '') {
  return page(`
  <h1>Should I use this library?</h1>
  <p class="sub">Paste a GitHub repository. Get a verdict, and every number in it links back to its source.</p>
  ${message === '' ? '' : `<div class="err">${message}</div><div style="height:1px"></div>`}
  <form method="get" action="/">
    <input type="text" name="repo" placeholder="nodejs/node or a github.com URL" value="${esc(value)}" aria-label="repository">
    <button type="submit">Check</button>
  </form>
  <p class="hint">It looks at six signals and tells you what it does <em>not</em> look at. It cannot tell you whether the code works — only whether the project looks healthy.</p>`);
}

function resultPage(result) {
  const rows = result.signals.map((s) => `
    <tr>
      <td class="lvl ${LEVEL_CLASS[s.level] ?? ''}">${esc(s.level)}</td>
      <td class="nm">${esc(s.label)}</td>
      <td>${esc(s.value)}${s.blind ? `<span class="blind">blind spot: ${esc(s.blind)}</span>` : ''}</td>
    </tr>`).join('');

  const sources = [...new Set(result.signals.map((s) => s.source).filter(Boolean))]
    .map((u) => `<li><a href="${esc(u)}" rel="noopener noreferrer nofollow">${esc(u)}</a></li>`).join('');

  const notMeasured = result.notMeasured.map((x) => `<li>${esc(x)}</li>`).join('');

  return page(`
  <h1>${esc(result.repo)}</h1>
  <p class="sub">${esc(headline(result))}</p>
  <div class="card">
    <p class="head">score ${result.score.toFixed(2)} &middot; ${esc(result.band)}</p>
    <p class="meta2">assessed ${esc(result.assessedAt)}</p>
    <table>${rows}</table>
  </div>
  <div class="card">
    <p class="head" style="font-size:1rem">Not measured at all</p>
    <ul class="nm-list">${notMeasured}</ul>
  </div>
  <div class="card">
    <p class="head" style="font-size:1rem">Sources</p>
    <ul class="src">${sources}</ul>
  </div>
  <p class="hint"><a href="/">Check another</a></p>`);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const startedMs = metrics.requestStarted();
  const send = (p) => {
    res.writeHead(p.status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(p.html);
  };

  if (url.pathname === '/healthz') {
    // Health checks fire constantly; counting them would drown the real traffic.
    metrics.requestDiscarded();
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  if (url.pathname === '/metrics') {
    /*
     * Not counted, deliberately. Observing the product is not using it, and
     * counting the observation makes every number drift each time someone looks —
     * which is how a dashboard ends up never agreeing with itself.
     */
    metrics.requestDiscarded();
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(metrics.snapshot(), null, 2));
    return;
  }
  if (url.pathname !== '/') {
    metrics.requestFinished(startedMs, { ok: false, repo: null, apiCalls: 0, reason: 'unknown path' });
    send(page('<h1>Not found</h1><p class="sub"><a href="/">Back</a></p>', 404));
    return;
  }

  const input = url.searchParams.get('repo');
  if (input === null || input.trim() === '') {
    /*
     * A blank query is not a successful lookup — it is the front page, and
     * counting it as a success inflated the success rate while adding a `null`
     * row to the per-repo table. Neither is visible unless the numbers are
     * reconciled, which is why the reconciliation check exists.
     */
    metrics.requestDiscarded();
    send(searchPage());
    return;
  }

  const repo = parseRepo(input);
  if (repo === null) {
    // Counted as a failure with its own reason: "someone pasted something that is
    // not a repo" is a product signal (the hint is not clear enough), not noise.
    metrics.requestFinished(startedMs, { ok: false, repo: null, apiCalls: 0, reason: 'invalid repo input' });
    send(searchPage('That does not look like a repository. Try <code>nodejs/node</code> or a github.com URL.', input));
    return;
  }

  try {
    const facts = await fetchRepoFacts(repo, { token: process.env.GITHUB_TOKEN });
    const result = assess(facts);
    metrics.requestFinished(startedMs, { ok: true, repo: result.repo, apiCalls: 4, reason: null });
    send(resultPage(result));
  } catch (cause) {
    // Every failure a stranger can cause becomes a sentence, never a blank page.
    const isRateLimit = cause instanceof GitHubError && /rate limit/i.test(cause.message);
    const reason = isRateLimit ? 'github rate limit'
      : cause instanceof GitHubError && cause.status === 404 ? 'repository not found'
        : cause instanceof GitHubError ? 'github request failed'
          : 'unexpected error';
    metrics.requestFinished(startedMs, { ok: false, repo: null, apiCalls: 1, reason, rateLimited: isRateLimit });
    const text = cause instanceof GitHubError
      ? esc(cause.message)
      : 'Something went wrong while fetching that repository.';
    if (!(cause instanceof GitHubError)) console.error(cause);
    send(page(`<h1>Could not check that</h1><div class="err"><b>${esc(repo.owner)}/${esc(repo.name)}</b><br>${text}</div>
      <p class="hint"><a href="/">Try another</a></p>`, 502));
  }
});

if (process.argv[1]?.endsWith('server.js') === true) {
  server.listen(PORT, HOST, () => {
    console.log(`repo-vitals listening on http://${HOST}:${PORT}`);
  });
}

export { server };
