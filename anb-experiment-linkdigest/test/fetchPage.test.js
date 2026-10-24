const { test, assert, equal, includes, throwsAsync } = globalThis.__suite;
const { fetchPage } = await import('../src/fetchPage.js');
const { LIMITS } = await import('../src/limits.js');

function htmlResponse(body, init = {}) {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { 'content-type': init.contentType ?? 'text/html; charset=utf-8' },
  });
}

test('rejects a non-http protocol before any network call', async () => {
  let called = false;
  await throwsAsync(
    () => fetchPage('file:///etc/passwd', { fetchImpl: async () => { called = true; return htmlResponse('x'); } }),
    'http and https',
  );
  assert(!called, 'should not have touched the network');
});

test('rejects a string that is not a URL', async () => {
  await throwsAsync(() => fetchPage('not a url', { fetchImpl: async () => htmlResponse('x') }), 'Not a URL');
});

test('surfaces a non-200 as a readable error, not a stack trace', async () => {
  const message = await throwsAsync(
    () => fetchPage('https://example.com/x', { fetchImpl: async () => htmlResponse('nope', { status: 404 }) }),
  );
  includes(message, 'HTTP 404');
});

test('refuses a content type that is not a web page', async () => {
  const message = await throwsAsync(
    () => fetchPage('https://example.com/a.pdf', { fetchImpl: async () => htmlResponse('%PDF', { contentType: 'application/pdf' }) }),
  );
  includes(message, 'Not a web page');
});

test('truncates a body larger than the cap, and says so', async () => {
  const big = `<html><body><p>${'x'.repeat(LIMITS.maxResponseBytes + 5000)}</p></body></html>`;
  const page = await fetchPage('https://example.com/big', {
    fetchImpl: async () => htmlResponse(big),
    maxBytes: 1000,
  });
  equal(page.truncated, true, 'should be flagged as truncated');
  assert(page.html.length <= 1000, `html exceeded the cap: ${page.html.length}`);
});

test('a small page is not flagged as truncated', async () => {
  const page = await fetchPage('https://example.com/small', {
    fetchImpl: async () => htmlResponse('<p>tiny</p>'),
  });
  equal(page.truncated, false);
  includes(page.html, 'tiny');
});

test('a network failure becomes a readable error naming the host', async () => {
  const message = await throwsAsync(
    () => fetchPage('https://unreachable.example/x', { fetchImpl: async () => { throw new Error('ECONNREFUSED'); } }),
  );
  includes(message, 'unreachable.example');
  includes(message, 'ECONNREFUSED');
});
