import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { CapabilityGraph, KnowledgeChunk, RetrievedChunk } from './types.js';
import { expandTerms, tokenize } from './tokenize.js';

const SKIP_DIRS = new Set([
  '.git',
  '.turbo',
  '.next',
  '.data',
  'node_modules',
  'dist',
  'build',
  'site',
  'coverage',
]);

const ROOT_MARKDOWN = [
  'README.md',
  'ANB-README.md',
  'CLAUDE.md',
  'GLOSSARY.md',
  'PLAYBOOK.md',
  'SKILL-MAP.md',
];

const MATRIX_PATH = 'docs/product/matrix.json';

interface RawChunk {
  path: string;
  heading: string;
  text: string;
  kind: KnowledgeChunk['kind'];
}

export interface CorpusOptions {
  root: string;
  graph?: CapabilityGraph;
  /** Maximum characters per chunk before it is split at a paragraph boundary. */
  maxChunkChars?: number;
  /**
   * Portable source bundle produced by `scripts/materialize-main-knowledge.py`.
   * Defaults to `<root>/packages/consult/data/sources.json`.
   */
  sourcesPath?: string;
}

interface SourceBundle {
  files: { path: string; text: string }[];
  matrix?: unknown;
}

export class KnowledgeCorpus {
  readonly chunks: KnowledgeChunk[];
  private readonly postings = new Map<string, { index: number; tf: number }[]>();
  private readonly avgLength: number;

  constructor(chunks: KnowledgeChunk[]) {
    this.chunks = chunks;

    let totalLength = 0;
    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i];
      if (chunk === undefined) continue;
      totalLength += chunk.length;

      const counts = new Map<string, number>();
      for (const term of tokenize(chunk.text)) {
        counts.set(term, (counts.get(term) ?? 0) + 1);
      }
      for (const [term, tf] of counts) {
        const list = this.postings.get(term) ?? [];
        list.push({ index: i, tf });
        this.postings.set(term, list);
      }
    }
    this.avgLength = chunks.length === 0 ? 0 : totalLength / chunks.length;
  }

  static load(options: CorpusOptions): KnowledgeCorpus {
    const root = resolve(options.root);
    const maxChunkChars = options.maxChunkChars ?? 1600;
    const raw: RawChunk[] = [];
    const bundle = readSourceBundle(root, options.sourcesPath);

    if (bundle !== undefined) {
      for (const file of bundle.files) {
        raw.push(...splitMarkdown(file.path, file.text, maxChunkChars));
      }
      raw.push(...matrixChunks(root, bundle.matrix));
    } else {
      for (const rel of ROOT_MARKDOWN) {
        const abs = join(root, rel);
        if (!existsSync(abs)) continue;
        raw.push(...splitMarkdown(rel, readFileSync(abs, 'utf8'), maxChunkChars));
      }

      for (const rel of walkMarkdown(root, 'docs')) {
        raw.push(...splitMarkdown(rel, readFileSync(join(root, rel), 'utf8'), maxChunkChars));
      }

      for (const rel of walkSkills(root)) {
        raw.push(...splitMarkdown(rel, readFileSync(join(root, rel), 'utf8'), maxChunkChars));
      }

      for (const rel of walkMarkdown(root, 'work')) {
        raw.push(...splitMarkdown(rel, readFileSync(join(root, rel), 'utf8'), maxChunkChars));
      }

      raw.push(...matrixChunks(root));
    }

    if (options.graph !== undefined) raw.push(...capabilityChunks(options.graph));

    const chunks: KnowledgeChunk[] = raw.map((item, index) => ({
      id: chunkId(item.path, item.heading, index),
      path: item.path,
      heading: item.heading,
      text: item.text,
      length: Math.max(1, tokenize(item.text).length),
      kind: item.kind,
    }));

    return new KnowledgeCorpus(chunks);
  }

  /**
   * BM25 over the corpus, with a heading/path boost and an exact-phrase bonus.
   *
   * Scores are relative, not calibrated. The answer layer uses `coverage` and the
   * graph classifier's own score for confidence, never the raw BM25 number.
   */
  search(question: string, limit = 8): RetrievedChunk[] {
    const queryTerms = expandTerms(question);
    const unique = [...new Set(queryTerms)].filter((term) => term.length > 0);
    if (unique.length === 0 || this.chunks.length === 0) return [];

    const k1 = 1.2;
    const b = 0.75;
    const scores = new Map<number, number>();
    const matched = new Map<number, Set<string>>();

    for (const term of unique) {
      const posting = this.postings.get(term);
      if (posting === undefined) continue;
      const df = posting.length;
      const idf = Math.log(1 + (this.chunks.length - df + 0.5) / (df + 0.5));

      for (const { index, tf } of posting) {
        const chunk = this.chunks[index];
        if (chunk === undefined) continue;
        const denominator = tf + k1 * (1 - b + (b * chunk.length) / this.avgLength);
        let score = idf * ((tf * (k1 + 1)) / denominator);

        if (chunk.heading.includes(term)) score *= 1.6;
        if (chunk.path.includes(term)) score *= 1.2;

        scores.set(index, (scores.get(index) ?? 0) + score);
        const set = matched.get(index) ?? new Set<string>();
        set.add(term);
        matched.set(index, set);
      }
    }

    // Exact phrase is a strong signal in Chinese, where bigram overlap can make
    // unrelated technical sentences look similar.
    const phrase = question.trim();
    if (phrase.length >= 4) {
      for (let i = 0; i < this.chunks.length; i += 1) {
        const chunk = this.chunks[i];
        if (chunk !== undefined && chunk.text.includes(phrase)) {
          scores.set(i, (scores.get(i) ?? 0) + 6);
        }
      }
    }

    const ranked = [...scores.entries()]
      .map(([index, score]) => {
        const chunk = this.chunks[index];
        const terms = matched.get(index) ?? new Set<string>();
        // Matrix cells are short and precise, so raw BM25 over-rewards them. The
        // design docs carry the reasoning; keep them in front when scores are
        // close. This is a ranking prior, not a correctness claim.
        const kindWeight = chunk?.kind === 'matrix' ? 0.55 : chunk?.kind === 'document' ? 1.15 : 1;
        const pathWeight =
          chunk?.path === 'CLAUDE.md'
            ? 2.2
            : chunk?.path === 'PLAYBOOK.md'
              ? 1.7
              : chunk?.path === 'docs/skills/skill-chain.md'
                ? 1.6
                : chunk?.path === 'docs/product/main-agent-capability-graph.md'
                  ? 0.8
                  : chunk?.path.startsWith('work/tickets/')
                    ? 0.45
                    : chunk?.path.startsWith('work/evidence/')
                      ? 0.7
                      : 1;
        return {
          chunk: chunk as KnowledgeChunk,
          score: score * kindWeight * pathWeight,
          coverage: unique.length === 0 ? 0 : terms.size / unique.length,
          matchedTerms: [...terms],
        };
      })
      .filter((item) => item.chunk !== undefined && item.chunk.kind !== 'capability')
      .sort((a, b2) => b2.score - a.score);

    // Path diversity: a single matrix file would otherwise fill every slot. The
    // first chunk from a path keeps its score; later chunks from the same path are
    // discounted. Matrix cells are discounted harder because there are dozens of
    // them and they all share one path.
    const pathCounts = new Map<string, number>();
    const diversified = ranked.map((item) => {
      const count = pathCounts.get(item.chunk.path) ?? 0;
      pathCounts.set(item.chunk.path, count + 1);
      const penalty = item.chunk.kind === 'matrix' ? 0.28 : 0.72;
      return { ...item, score: item.score * Math.pow(penalty, count) };
    });

    return diversified.sort((a, b2) => b2.score - a.score).slice(0, limit);
  }
}

function chunkId(path: string, heading: string, index: number): string {
  return createHash('sha1').update(`${path}#${heading}#${index}`).digest('hex').slice(0, 12);
}

function splitMarkdown(relPath: string, text: string, maxChars: number): RawChunk[] {
  const lines = text.split(/\r?\n/);
  const chunks: RawChunk[] = [];
  const stack: { level: number; title: string }[] = [];
  let buffer: string[] = [];

  const flush = (): void => {
    const body = buffer.join('\n').trim();
    if (body.length === 0) return;
    const heading = stack.map((item) => item.title).join(' > ') || relPath;
    for (const part of splitLong(body, maxChars)) {
      chunks.push({ path: relPath, heading, text: part, kind: 'document' });
    }
    buffer = [];
  };

  for (const line of lines) {
    const match = /^(#{1,4})\s+(.+)$/.exec(line);
    if (match === null) {
      buffer.push(line);
      continue;
    }

    flush();
    const level = match[1]?.length ?? 1;
    const title = (match[2] ?? '').trim();
    while (stack.length > 0 && (stack[stack.length - 1]?.level ?? 0) >= level) {
      stack.pop();
    }
    stack.push({ level, title });
    buffer.push(line);
  }
  flush();

  return chunks;
}

function splitLong(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const paragraphs = text.split(/\n{2,}/);
  const parts: string[] = [];
  let current = '';

  const push = (): void => {
    if (current.trim().length > 0) parts.push(current.trim());
    current = '';
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      push();
      for (let i = 0; i < paragraph.length; i += maxChars) {
        parts.push(paragraph.slice(i, i + maxChars));
      }
      continue;
    }
    if ((current + '\n\n' + paragraph).length > maxChars) push();
    current = current.length === 0 ? paragraph : `${current}\n\n${paragraph}`;
  }
  push();

  return parts.length === 0 ? [text] : parts;
}

function walkMarkdown(root: string, dir: string): string[] {
  const absolute = join(root, dir);
  if (!existsSync(absolute)) return [];

  const out: string[] = [];
  const visit = (current: string): void => {
    for (const entry of readdirSync(current)) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(current, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        visit(full);
      } else if (entry.endsWith('.md')) {
        out.push(relative(root, full));
      }
    }
  };
  visit(absolute);
  return out.sort();
}

function walkSkills(root: string): string[] {
  const base = join(root, '.claude', 'skills');
  if (!existsSync(base)) return [];

  const out: string[] = [];
  for (const entry of readdirSync(base)) {
    if (!entry.startsWith('anb') && !entry.startsWith('native-agent-dev')) continue;
    const skill = join(base, entry, 'SKILL.md');
    if (existsSync(skill)) out.push(relative(root, skill));
  }
  return out.sort();
}

interface MatrixCell {
  stage: string;
  layer: string;
  kind: string;
  input: string;
  output: string;
  failure: string;
  checker: { cmd: string; exit: string; note?: string } | null;
}

interface MatrixTransition {
  from: string[];
  to: string[];
  carries: string;
  versioned: string[];
  downstreamChecks: string;
  breaks: string;
}

function readSourceBundle(root: string, sourcesPath?: string): SourceBundle | undefined {
  const absolute = sourcesPath ?? join(root, 'packages', 'consult', 'data', 'sources.json');
  if (!existsSync(absolute)) return undefined;

  try {
    const parsed = JSON.parse(readFileSync(absolute, 'utf8')) as {
      files?: unknown;
      matrix?: unknown;
    };
    if (!Array.isArray(parsed.files)) return undefined;

    const files: { path: string; text: string }[] = [];
    for (const item of parsed.files) {
      if (typeof item !== 'object' || item === null) continue;
      const path = (item as { path?: unknown }).path;
      const text = (item as { text?: unknown }).text;
      if (typeof path === 'string' && typeof text === 'string') files.push({ path, text });
    }
    if (files.length === 0) return undefined;
    return { files, ...(parsed.matrix !== undefined ? { matrix: parsed.matrix } : {}) };
  } catch {
    return undefined;
  }
}

function matrixChunks(root: string, override?: unknown): RawChunk[] {
  const absolute = join(root, MATRIX_PATH);
  let parsed: { cells?: MatrixCell[]; transitions?: MatrixTransition[] };

  if (override !== undefined) {
    parsed = override as typeof parsed;
  } else {
    if (!existsSync(absolute)) return [];
    try {
      parsed = JSON.parse(readFileSync(absolute, 'utf8')) as typeof parsed;
    } catch {
      return [];
    }
  }

  const chunks: RawChunk[] = [];
  for (const cell of parsed.cells ?? []) {
    const checker =
      cell.checker === null
        ? '没有检查器；这一格目前只能由人关门。'
        : `检查器：${cell.checker.cmd}（${cell.checker.exit}）${cell.checker.note ? `；${cell.checker.note}` : ''}`;
    chunks.push({
      path: MATRIX_PATH,
      heading: `矩阵格 ${cell.stage} · ${cell.layer}`,
      text: [
        `矩阵格：${cell.stage} · ${cell.layer}（${cell.kind}）`,
        `输入：${cell.input}`,
        `输出：${cell.output}`,
        `失败：${cell.failure}`,
        checker,
      ].join('\n'),
      kind: 'matrix',
    });
  }

  for (const transition of parsed.transitions ?? []) {
    chunks.push({
      path: MATRIX_PATH,
      heading: `衔接 ${transition.from.join('·')} → ${transition.to.join('·')}`,
      text: [
        `衔接：${transition.from.join('·')} → ${transition.to.join('·')}`,
        `交的是什么：${transition.carries}`,
        `带哪些版本：${transition.versioned.join(' + ')}`,
        `下游怎么校验：${transition.downstreamChecks}`,
        `断了会怎样：${transition.breaks}`,
      ].join('\n'),
      kind: 'matrix',
    });
  }

  return chunks;
}

function capabilityChunks(graph: CapabilityGraph): RawChunk[] {
  return graph.nodes.map((node) => ({
    path: 'capability-graph',
    heading: node.title,
    text: [
      `能力节点：${node.title}`,
      node.summary,
      `能回答：${node.questions.join('；')}`,
      `下一步：${node.actions.join('；')}`,
      `边界：${node.boundaries.join('；')}`,
      `证据：${node.sources.map((source) => source.path).join('、')}`,
    ].join('\n'),
    kind: 'capability',
  }));
}
