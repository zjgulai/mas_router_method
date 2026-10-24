const { test, assert, equal, includes } = globalThis.__suite;
const { extractText, extractTitle, decodeEntities, countLinks } = await import('../src/extract.js');

test('decodes named and numeric entities', () => {
  equal(decodeEntities('a &amp; b &#65; &#x42; &hellip;'), 'a & b A B …');
});

test('leaves unknown entities alone rather than eating them', () => {
  equal(decodeEntities('&notarealentity;'), '&notarealentity;');
});

test('prefers the social title when present', () => {
  const html = '<title>Plain</title><meta property="og:title" content="Social &amp; Nice">';
  equal(extractTitle(html), 'Social & Nice');
});

test('falls back to <title>', () => {
  equal(extractTitle('<title>  Spaced   Out  </title>'), 'Spaced Out');
});

test('strips scripts and styles with their contents', () => {
  const html = '<style>body{color:red}</style><script>var secret=1</script><p>Real text.</p>';
  const text = extractText(html);
  assert(!text.includes('color:red'), 'style leaked');
  assert(!text.includes('secret'), 'script leaked');
  includes(text, 'Real text.');
});

test('block tags become line breaks so sentences survive', () => {
  const text = extractText('<p>One.</p><p>Two.</p>');
  equal(text, 'One.\nTwo.');
});

test('counts anchors, not links in text', () => {
  equal(countLinks('<a href="/a">x</a> <a href="/b">y</a> plain'), 2);
  equal(countLinks('no links here'), 0);
});
