/**
 * Tokenisation for a bilingual corpus.
 *
 * English words are easy. Chinese is not: whitespace does not separate words and
 * a dictionary is a dependency we do not want. The compromise is character
 * bigrams/trigrams for CJK — cheap, deterministic, and good enough for retrieval
 * over technical prose. It is deliberately not a linguistic tokenizer.
 */

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const CJK_RUN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g;
const ASCII_WORD = /[a-z0-9][a-z0-9_+#.-]*/g;

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'can',
  'do',
  'does',
  'for',
  'from',
  'has',
  'have',
  'how',
  'i',
  'if',
  'in',
  'is',
  'it',
  'its',
  'me',
  'my',
  'of',
  'on',
  'or',
  'so',
  'that',
  'the',
  'their',
  'then',
  'there',
  'this',
  'to',
  'was',
  'we',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'will',
  'with',
  'you',
  'your',
  '的',
  '了',
  '和',
  '与',
  '或',
  '是',
  '在',
  '有',
  '我',
  '你',
  '他',
  '她',
  '它',
  '们',
  '这',
  '那',
  '哪',
  '什么',
  '怎么',
  '为什么',
  '如何',
  '一个',
  '一种',
  '可以',
  '需要',
  '应该',
  '吗',
  '呢',
  '吧',
  '啊',
  '呀',
  '就',
  '也',
  '都',
  '很',
  '更',
]);

/**
 * Query expansion. These are not "thesaurus" entries; they are the words users
 * actually type versus the words this repository uses. Keep it small and
 * evidence-driven — every pair should come from a real mismatch we observed.
 */
const SYNONYMS: Record<string, string[]> = {
  看板: ['呈现', 'dashboard', '报表'],
  呈现: ['看板', 'dashboard'],
  口径: ['定义', '版本', 'metric'],
  定义: ['口径', 'definition'],
  归因: ['因果', '弹性', 'attribution'],
  因果: ['归因', 'causal'],
  弹性: ['归因', 'elasticity'],
  机器人: ['bot', '飞书', 'feishu'],
  飞书: ['feishu', 'lark', 'bot'],
  评测: ['eval', '评估', '测试'],
  评估: ['eval', '评测'],
  提示词: ['prompt', '系统提示'],
  标签: ['打标', 'taxonomy', 'label'],
  打标: ['标签', 'labeling'],
  采集: ['抓取', 'collect', 'ingest'],
  抓取: ['采集', 'crawl'],
  血缘: ['lineage', '追溯'],
  证伪: ['falsify', 'falsification', '推翻'],
  需求: ['job story', 'prd', '问题'],
  验收: ['gate', 'acceptance', '通过线'],
  答错: ['diagnose', 'diagnosis', 'debug', 'wrong', 'failure'],
  不对: ['wrong', 'failure', 'diagnose'],
  诊断: ['diagnose', 'diagnosis', 'debug'],
  失败: ['failure', 'error', 'fallback'],
  流程: ['lane', 'sop', '车道'],
  事故: ['incident', 'inc'],
  版本: ['version', '口径'],
  区间: ['confidence interval', '置信区间', 'ci'],
  缺失: ['missing', '空抓', '无法判断'],
  重复: ['dedupe', '去重', 'duplicate'],
};

function isCjkChar(char: string): boolean {
  return CJK.test(char);
}

function addCjkRun(run: string, out: string[]): void {
  if (run.length === 0) return;
  if (run.length === 1) {
    out.push(run);
    return;
  }
  for (let i = 0; i < run.length - 1; i += 1) {
    out.push(run.slice(i, i + 2));
  }
  for (let i = 0; i < run.length - 2; i += 1) {
    out.push(run.slice(i, i + 3));
  }
}

/**
 * Tokenise text into lowercase terms. Duplicates are preserved on purpose:
 * term frequency is part of BM25.
 */
export function tokenize(text: string): string[] {
  const normalised = text
    .toLowerCase()
    .replace(/[‘’“”]/g, '')
    .replace(/[\u3000\s]+/g, ' ')
    .replace(/[，。！？；：、（）【】《》「」『』]/g, ' ');

  const out: string[] = [];

  for (const match of normalised.matchAll(CJK_RUN)) {
    addCjkRun(match[0], out);
  }

  for (const match of normalised.matchAll(ASCII_WORD)) {
    const word = match[0];
    if (word.length < 2) continue;
    if (STOPWORDS.has(word)) continue;
    out.push(word);
    // `first_seen_at` should also match a query for `first` or `seen`.
    if (word.includes('_')) {
      for (const part of word.split('_')) {
        if (part.length >= 2 && !STOPWORDS.has(part)) out.push(part);
      }
    }
  }

  return out.filter((term) => term.length > 0 && !STOPWORDS.has(term));
}

/** Expand a question's terms with the small synonym table. */
export function expandTerms(question: string): string[] {
  const base = tokenize(question);
  const expanded = new Set(base);

  for (const [term, synonyms] of Object.entries(SYNONYMS)) {
    const termTokens = tokenize(term);
    const hit = termTokens.some((t) => base.includes(t)) || question.includes(term);
    if (!hit) continue;
    for (const synonym of synonyms) {
      for (const token of tokenize(synonym)) expanded.add(token);
    }
  }

  return [...expanded];
}

export function hasCjk(text: string): boolean {
  return CJK.test(text);
}

export { isCjkChar };
