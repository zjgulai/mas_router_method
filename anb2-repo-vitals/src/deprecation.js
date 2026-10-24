/**
 * Detect whether a project's own README says "do not use this".
 *
 * This exists because GitHub's metadata cannot express it. `moment` is not
 * archived, has 48k stars, and was actively committed to within a year — every
 * field the API offers says "healthy". Its README says otherwise, and that is the
 * only place the truth lives.
 *
 * The hard part is not finding the word "deprecated" — it is *not* finding it.
 * Library READMEs discuss deprecations all the time ("this version deprecates X").
 * A detector that fires on those teaches the reader to ignore the flag, which is
 * worse than no flag.
 *
 * So the rule is: a *project-level* statement about the project itself, not a
 * statement about an API, an option, or a version inside it.
 */

/**
 * Phrases that mean "this project is finished", in the forms maintainers use.
 * Each is intentionally narrow; broad patterns caused the false alarms this
 * module exists to avoid.
 */
const PROJECT_LEVEL = [
  // Real-world phrasings, added after testing against moment/moment — whose notice
  // reads "a legacy project, now in maintenance mode. New features are not being
  // accepted." None of the patterns below were in the first version, because the
  // first version was written from what I imagined a deprecation notice says.
  /\b(?:is|in)\s+(?:a\s+)?legacy\s+project\b/i,
  /\b(?:in|under)\s+maintenance\s+mode\b/i,
  /\bnew features?\s+(?:are|is)\s+not\s+(?:being\s+)?(?:accepted|added)\b/i,
  /\bfeature[- ]frozen\b/i,
  /\bno longer (?:accepting|receiving)\s+(?:new\s+)?(?:features|contributions|pull requests)\b/i,
  /\bthis (?:package|project|library|module|repo|repository)\b[^.]{0,40}\b(?:is|has been)\b[^.]{0,40}\b(?:no longer (?:supported|maintained|updated)|deprecated|discontinued|unmaintained|archived)\b/i,
  /\bno longer (?:supported|maintained|actively maintained|updated|developed)\b/i,
  /\bnot (?:actively )?maintained(?: anymore)?\b/i,
  /\bdeprecated\b[^.]{0,30}\b(?:use|switch to|migrate to|see)\b/i,
  /\b(?:we|the authors?|the maintainers?)\b[^.]{0,30}\brecommend against\b/i,
  /\bthis (?:project|package|library)\b[^.]{0,30}\b(?:reached end[- ]of[- ]life|is at end of life|has reached EOL)\b/i,
];

/**
 * Contexts that make a match *not* a project-level deprecation.
 *
 * These are checked against the sentence the match sits in. If any applies, the
 * match is discarded — a deliberate bias toward silence, because a false "this is
 * deprecated" is more damaging than a missed one: it makes every future flag
 * suspect.
 */
const NOT_PROJECT_LEVEL = [
  // Real false alarm, found by running against jquery/jquery: "The 2.x and 1.x
  // branches are no longer supported." That is about two branches of an active
  // project, not about the project. A version-scoped subject disqualifies the
  // sentence, whatever the predicate says.
  /\b\d+\.x\b/i,
  /\b(?:branch|branches|series|release line|version line)\b/i,
  /\b(?:the\s+)?(?:old|previous|legacy)\s+(?:version|release|branch)\b/i,
  /\bdeprecates?\b\s+(?:the\s+)?(?:old|previous|legacy)\s+(?:api|option|method|flag|parameter|argument|syntax)\b/i,
  /\bdeprecat(?:ed|es)\b[^.]{0,20}\b(?:in|since)\s+v?\d+(?:\.\d+)*/i,
  /\b(?:api|option|method|flag|parameter|argument|syntax|field|endpoint)\b[^.]{0,20}\bdeprecated\b/i,
  /\bdeprecation (?:notice|warning|policy|cycle|period)\b/i,
  /\bwill be (?:removed|deprecated) in\b/i,
];

/** Split into sentences so a match can be judged in context, not in isolation. */
function sentences(text) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().length > 0);
}

/**
 * Inspect README text. Returns `{ deprecated, evidence, reason }`.
 *
 * `evidence` is the sentence that triggered it, because a flag the reader cannot
 * check is a flag they will not trust.
 */
export function detectDeprecation(readme) {
  if (typeof readme !== 'string' || readme.trim() === '') {
    return { deprecated: false, evidence: null, reason: 'no readme available' };
  }

  // The first ~2000 characters carry the notice in every real case observed;
  // scanning the whole file invites matches in changelog sections.
  const head = readme.slice(0, 2000);

  for (const sentence of sentences(head)) {
    if (NOT_PROJECT_LEVEL.some((re) => re.test(sentence))) continue;
    for (const pattern of PROJECT_LEVEL) {
      if (pattern.test(sentence)) {
        return { deprecated: true, evidence: sentence.trim(), reason: 'readme says the project is finished' };
      }
    }
  }

  return { deprecated: false, evidence: null, reason: 'no project-level deprecation wording found' };
}
