const { test, assert, equal } = globalThis.__t;
test('a third product can register a check with no setup beyond __t', () => {
  assert(true);
  equal(1 + 1, 2);
});
