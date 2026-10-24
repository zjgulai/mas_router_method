import { LIMITS } from './limits.js';

/**
 * Split text into sentences without pulling in a tokeniser.
 *
 * The rule is deliberately simple and stated, so a wrong split is debuggable.
 * Abbreviations are the main source of error; we only guard the common ones.
 */
const ABBREVIATIONS = /\b(?:e\.g|i\.e|etc|vs|Mr|Mrs|Ms|Dr|Prof|No|Inc|Ltd|Co|St|approx)\.$/i;

export function splitSentences(text) {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat === '') return [];

  const sentences = [];
  let buffer = '';
  for (const chunk of flat.split(/(?<=[.!?])\s+/)) {
    buffer = buffer === '' ? chunk : `${buffer} ${chunk}`;
    if (ABBREVIATIONS.test(buffer)) continue;
    sentences.push(buffer);
    buffer = '';
  }
  if (buffer !== '') sentences.push(buffer);
  return sentences;
}

/**
 * Pick the first N substantive sentences.
 *
 * "Substantive" means long enough to be a sentence rather than a nav label —
 * the threshold is in LIMITS so the tests and the code cannot disagree about it.
 */
export function summarise(text, options = {}) {
  const limit = options.sentences ?? LIMITS.summarySentences;
  const sentences = splitSentences(text).filter(
    (s) => s.length >= LIMITS.minSentenceChars,
  );
  return sentences.slice(0, limit);
}

/** Word-frequency sketch used only for display, never for ranking the summary. */
export function topWords(text, count = 8) {
  const stop = new Set([
    'the','and','for','that','with','this','from','have','has','are','was','were','not',
    'but','you','your','our','their','its','his','her','they','them','there','these',
    'those','will','would','can','could','should','may','might','must','been','being',
    'about','into','than','then','when','what','which','who','how','why','all','any',
    'more','most','some','such','only','also','just','over','under','between','after',
    'before','because','while','where','it','is','of','to','in','on','at','as','by',
    'or','an','a','be','do','does','did','if','so','no','we','us','me','my','he','she',
  ]);
  const counts = new Map();
  for (const raw of text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []) {
    if (stop.has(raw)) continue;
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, count)
    .map(([word, n]) => ({ word, n }));
}
