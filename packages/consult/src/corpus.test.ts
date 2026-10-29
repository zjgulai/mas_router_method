import { describe, expect, it } from 'vitest';
import { capabilityGraph } from './capability-graph.js';
import { KnowledgeCorpus } from './corpus.js';
import { findRepoRoot } from './paths.js';

const root = findRepoRoot();
const corpus = KnowledgeCorpus.load({ root, graph: capabilityGraph });

describe('knowledge corpus', () => {
  it('loads documents, matrix cells, and capability nodes', () => {
    expect(corpus.chunks.length).toBeGreaterThan(100);
    expect(corpus.chunks.some((chunk) => chunk.kind === 'document')).toBe(true);
    expect(corpus.chunks.some((chunk) => chunk.kind === 'matrix')).toBe(true);
    expect(corpus.chunks.filter((chunk) => chunk.kind === 'capability')).toHaveLength(
      capabilityGraph.nodes.length,
    );
  });

  it('retrieves the §七 correlation gate for a correlation question', () => {
    const results = corpus.search('区域间声量相关性 0.9 还能做归因吗', 12);
    const top = results.map((item) => `${item.chunk.path} ${item.chunk.heading}`);
    expect(top.some((item) => item.includes('data-product-design.md'))).toBe(true);
    expect(top.some((item) => item.includes('data-product-layers.md'))).toBe(true);
  });

  it('retrieves the taxonomy version rule for a label-version question', () => {
    const results = corpus.search('标签改版后历史数据不可比怎么办', 8);
    const top = results.slice(0, 5).map((item) => `${item.chunk.path} ${item.chunk.heading}`);
    expect(top.some((item) => item.includes('data-product-design.md'))).toBe(true);
    expect(top.some((item) => item.includes('taxonomy') || item.includes('打标'))).toBe(true);
  });

  it('retrieves the agent diagnosis order for a prompt question', () => {
    const results = corpus.search('Agent 答错了是不是应该改 prompt', 12);
    const top = results.map((item) => `${item.chunk.path} ${item.chunk.heading}`);
    expect(
      top.some(
        (item) =>
          item.includes('CLAUDE.md') ||
          item.includes('skill-chain.md') ||
          item.includes('agent-delivery-sop.md'),
      ),
    ).toBe(true);
  });

  it('retrieves the Feishu event path for a callback question', () => {
    const results = corpus.search('飞书机器人事件回调怎么接', 8);
    const top = results.slice(0, 6).map((item) => `${item.chunk.path} ${item.chunk.heading}`);
    expect(
      top.some(
        (item) =>
          item.includes('packages/feishu') ||
          item.includes('docs/roadmap.md') ||
          item.includes('apps/bot-gateway'),
      ),
    ).toBe(true);
  });

  it('returns no results for an empty query', () => {
    expect(corpus.search('', 5)).toHaveLength(0);
  });
});
