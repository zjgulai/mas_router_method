/**
 * The one outside dependency: the GitHub API.
 *
 * Every number this tool prints comes from here, and every one carries the URL it
 * came from so a reader can check it. That is the product's whole claim — a
 * conclusion you can audit — so provenance is not decoration.
 */
const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(message, info = {}) {
    super(message);
    this.name = 'GitHubError';
    this.url = info.url;
    this.status = info.status;
  }
}

/**
 * Fetch one JSON resource, with its source URL attached.
 *
 * Errors name the URL and the status: "could not fetch" is useless when three
 * requests were made and one of them failed.
 */
async function getJson(path, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const url = `${API}${path}`;
  const headers = { 'user-agent': 'repo-vitals/1.0', accept: 'application/vnd.github+json' };
  if (options.token !== undefined && options.token !== '') {
    headers.authorization = `Bearer ${options.token}`;
  }

  let response;
  try {
    response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new GitHubError(`Could not reach GitHub for ${url}: ${message}`, { url });
  }

  if (response.status === 404) {
    throw new GitHubError(`No such repository (${url})`, { url, status: 404 });
  }
  if (response.status === 403 || response.status === 429) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    throw new GitHubError(
      `GitHub rate limit at ${url} (remaining: ${remaining ?? 'unknown'}). Set GITHUB_TOKEN to raise it.`,
      { url, status: response.status },
    );
  }
  if (!response.ok) {
    throw new GitHubError(`GitHub returned ${response.status} for ${url}`, { url, status: response.status });
  }

  return { data: await response.json(), url, headers: response.headers };
}

/**
 * Read a total count from a paginated endpoint without downloading the pages.
 *
 * With `per_page=1`, the `Link` header's `rel="last"` page number *is* the row
 * count. When there is no Link header the list fits on one page, so the body
 * length is the count. Returning null when neither is readable is deliberate: a
 * guessed number is worse than an admitted unknown.
 */
export function countFromLink(result, links) {
  const header = result.headers?.get?.('link');
  if (typeof header === 'string' && header.length > 0) {
    const last = /[?&]page=(\d+)>;\s*rel="last"/.exec(header);
    if (last !== null) return Number(last[1]);
  }
  if (Array.isArray(result.data)) return result.data.length;
  if (Array.isArray(links)) return links.length;
  return null;
}

/**
 * GitHub returns README contents base64-encoded with newlines. Anything else
 * (a missing file, an odd shape) becomes null rather than a string of mojibake.
 */
export function decodeReadme(payload) {
  if (payload === null || typeof payload !== 'object') return null;
  const content = payload.content;
  const encoding = payload.encoding;
  if (typeof content !== 'string') return null;
  if (encoding !== 'base64') return null;
  try {
    return Buffer.from(content.replace(/\s+/g, ''), 'base64').toString('utf8');
  } catch {
    return null;
  }
}

/** Parse "owner/name", a full GitHub URL, or a URL with extra path segments. */
export function parseRepo(input) {
  const text = String(input).trim();
  const fromUrl = /github\.com\/([^/\s]+)\/([^/\s#?]+)/i.exec(text);
  const bare = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(text);
  const parts = fromUrl !== null
    ? { owner: fromUrl[1], name: fromUrl[2] }
    : bare !== null
      ? { owner: bare[1], name: bare[2] }
      : null;
  if (parts === null) return null;
  const name = parts.name.replace(/\.git$/i, '');
  if (name === '' || parts.owner === '') return null;
  return { owner: parts.owner, name };
}

/**
 * Collect the raw facts. One repository, four sources.
 *
 * `contributors` uses `per_page=1` and reads the `Link` header for the last page:
 * that returns the total count without downloading every contributor.
 */
export async function fetchRepoFacts(repo, options = {}) {
  const { owner, name } = repo;

  // GitHub's REST paths all live under /repos — the one prefix that is easy to
  // omit and produces a 404 that looks like "this repository does not exist".
  const base = `/repos/${owner}/${name}`;

  /*
   * Degradation policy, decided per request rather than globally.
   *
   *   info        — required. No repository metadata means no assessment at all.
   *   commits     — required. "How alive is it" is the headline signal; a verdict
   *                 without it would be a guess wearing a number.
   *   readme      — optional. Missing readme is normal; report the gap.
   *   issues      — optional. An unknown issue load is a gap, not a failure.
   *   contributors— optional, and the one most likely to be rate limited.
   *
   * Treating all five as required (the first version) meant one rate-limited
   * optional endpoint destroyed a verdict that was otherwise fully supported.
   */
  const soft = (promise) => promise.catch((cause) => ({ data: null, url: cause.url ?? `${API}${base}`, error: cause.message }));

  const [info, commits, issues, contributors, readme] = await Promise.all([
    getJson(base, options),
    getJson(`${base}/commits?per_page=1`, options),
    soft(getJson(`${base}/issues?state=open&per_page=1`, options)),
    soft(getJson(`${base}/contributors?per_page=1&anon=true`, options)),
    soft(getJson(`${base}/readme`, options)),
  ]);

  return {
    repo: { owner, name, fullName: info.data.full_name ?? `${owner}/${name}` },
    stars: { value: info.data.stargazers_count, source: info.url },
    forks: { value: info.data.forks_count, source: info.url },
    openIssues: { value: info.data.open_issues_count, source: info.url },
    archived: { value: info.data.archived === true, source: info.url },
    license: { value: info.data.license?.spdx_id ?? null, source: info.url },
    pushedAt: { value: info.data.pushed_at, source: info.url },
    createdAt: { value: info.data.created_at, source: info.url },
    lastCommit: { value: commits.data[0]?.commit?.author?.date ?? null, source: commits.url },
    contributors: { value: countFromLink(contributors, options.links), source: contributors.url },
    issuesSample: { count: Array.isArray(issues.data) ? issues.data.length : 0, source: issues.url },
    // Which optional sources failed, so the verdict can say "unknown because X".
    gaps: [issues, contributors, readme].filter((r) => r.data === null && r.error !== undefined).map((r) => r.error),
    readme: { value: decodeReadme(readme.data), source: readme.url },
  };
}
