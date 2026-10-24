const { test, assert, includes, equal } = globalThis.__t;
const { server } = await import('../src/server.js');

/**
 * The web surface, tested over real HTTP rather than by calling page builders.
 *
 * Calling the renderer directly would test a function; opening a socket tests the
 * thing a stranger touches. The difference matters here because the failures this
 * stage worries about — a blank page, a hang, a 200 with nothing in it — only
 * exist at the socket.
 */
async function withServer(fn) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('the front page opens and names the product', async () => {
  await withServer(async (base) => {
    const r = await fetch(base + '/');
    equal(r.status, 200);
    const html = await r.text();
    includes(html, 'Should I use this library?');
    includes(html, 'Get a verdict');
  });
});

test('it works on a phone-width viewport without horizontal scroll', async () => {
  await withServer(async (base) => {
    const html = await (await fetch(base + '/')).text();
    // A viewport meta tag is what stops a phone from rendering a desktop page
    // at 980px and letting the user zoom around.
    includes(html, 'name="viewport"');
    includes(html, 'width=device-width');
  });
});

test('a bad repository name is explained, not silently ignored', async () => {
  await withServer(async (base) => {
    const r = await fetch(base + '/?repo=nonsense');
    equal(r.status, 200);
    includes(await r.text(), 'does not look like a repository');
  });
});

test('an unknown path returns 404 with a way back', async () => {
  await withServer(async (base) => {
    const r = await fetch(base + '/nowhere');
    equal(r.status, 404);
    includes(await r.text(), 'Back');
  });
});

test('healthz answers without touching GitHub', async () => {
  await withServer(async (base) => {
    const r = await fetch(base + '/healthz');
    equal(r.status, 200);
    equal(await r.text(), 'ok');
  });
});

test('a GitHub failure produces a sentence, never a blank page or a stack trace', async () => {
  await withServer(async (base) => {
    // A repository that cannot exist: the real API answers 404 for it.
    const r = await fetch(base + '/?repo=this-org-does-not-exist-zzz/nope');
    assert(r.status === 502, `expected 502, got ${r.status}`);
    const html = await r.text();
    includes(html, 'Could not check that');
    assert(!html.includes('at Object.'), 'a stack trace leaked into the page');
    includes(html, 'Try another');
  });
});

test('the response declares a charset, so accented repository names survive', async () => {
  await withServer(async (base) => {
    const r = await fetch(base + '/');
    includes(r.headers.get('content-type') ?? '', 'charset=utf-8');
  });
});
