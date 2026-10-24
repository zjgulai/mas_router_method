const { test, assert, equal } = globalThis.__suite;
const { truncate, LIMITS } = await import('../src/limits.js');

test('truncate never returns more than the cap, marker included', () => {
  for (const max of [0, 1, 5, 12, 13, 50, 2000]) {
    const out = truncate('x'.repeat(5000), max);
    assert(out.length <= max, `cap ${max}: got ${out.length} chars`);
  }
});

test('truncate leaves short text untouched', () => {
  equal(truncate('short', 100), 'short');
});

test('the summary cap and the truncation cap are the same number', () => {
  // Failure mode 5: two copies of one limit. This asserts there is one source.
  const out = truncate('x'.repeat(LIMITS.maxSummaryChars * 2));
  assert(out.length <= LIMITS.maxSummaryChars, `exceeded the shared cap: ${out.length}`);
});
