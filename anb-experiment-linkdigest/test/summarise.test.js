const { test, assert, equal } = globalThis.__suite;
const { splitSentences, summarise, topWords } = await import('../src/summarise.js');
const { LIMITS } = await import('../src/limits.js');

test('splits on sentence enders', () => {
  equal(splitSentences('One. Two! Three?'), ['One.', 'Two!', 'Three?']);
});

test('keeps an abbreviation with its sentence', () => {
  const out = splitSentences('See e.g. the appendix. Then stop.');
  equal(out, ['See e.g. the appendix.', 'Then stop.']);
});

test('returns nothing for empty input instead of one empty sentence', () => {
  equal(splitSentences('   '), []);
  equal(summarise('   '), []);
});

test('honours the sentence count limit', () => {
  const text = 'This is a proper sentence that clears the threshold. Another proper sentence here too.';
  const out = summarise(text, { sentences: 1 });
  equal(out.length, 1);
});

test('drops a standalone nav-length fragment', () => {
  // A fragment only survives if it is its own sentence. "Home" has no sentence
  // terminator, so it merges into the next sentence — see the KNOWN LIMITATION
  // test below, which pins that behaviour rather than pretending it is fine.
  const text = 'Home. This is a proper sentence that clears the threshold.';
  const out = summarise(text);
  equal(out.length, 1);
  assert(!out[0].includes('Home'), 'nav fragment leaked into the summary');
});

test('KNOWN LIMITATION: a nav label with no terminator merges into the first sentence', () => {
  // Real pages look like "<nav>Home</nav><p>Real sentence.</p>", which the
  // extractor renders as "Home\nReal sentence." and the splitter then treats as
  // one sentence. Fixing it properly needs block-aware extraction, which this
  // tool does not do. Pinned so a future change cannot silently alter the output
  // without someone noticing.
  const out = summarise('Home This is a proper sentence that clears the threshold.');
  equal(out.length, 1);
  assert(out[0].startsWith('Home'), 'behaviour changed: update this test deliberately');
});

test('the snippet threshold comes from LIMITS, not a literal', () => {
  const justUnder = 'a'.repeat(LIMITS.minSentenceChars - 2); // + '.' = below
  const justOver = 'b'.repeat(LIMITS.minSentenceChars - 1);  // + '.' = at the cap
  equal(summarise(`${justUnder}. ${justOver}.`).length, 1);
});

test('topWords ignores stopwords and orders by count, descending', () => {
  const words = topWords('coffee coffee coffee grinder grinder beans the and', 3);
  equal(words.map((w) => w.word), ['coffee', 'grinder', 'beans']);
});

test('topWords breaks ties alphabetically', () => {
  const words = topWords('zebra apple zebra apple', 2);
  equal(words.map((w) => w.word), ['apple', 'zebra']);
});
