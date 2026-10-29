import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { capabilityGraph } from './capability-graph.js';
import { findRepoRoot } from './paths.js';

const root = findRepoRoot();
const path = join(root, 'packages', 'consult', 'data', 'eval', 'main-agent-cases.json');
const data = JSON.parse(readFileSync(path, 'utf8')) as {
  version: number;
  source: string;
  cases: {
    id: string;
    text: string;
    expected: string;
    expectedNodes?: string[];
    why: string;
    source?: string;
    verdict?: string;
    reviewNote?: string;
  }[];
};

describe('real-question eval dataset', () => {
  it('contains at least 20 real questions with unique ids and texts', () => {
    expect(data.cases.length).toBeGreaterThanOrEqual(20);
    expect(new Set(data.cases.map((item) => item.id)).size).toBe(data.cases.length);
    expect(new Set(data.cases.map((item) => item.text)).size).toBe(data.cases.length);
  });

  it('uses the three declared expectation labels and real node ids', () => {
    const nodeIds = new Set(capabilityGraph.nodes.map((node) => node.id));
    for (const item of data.cases) {
      expect(['in_scope', 'needs_context', 'out_of_scope']).toContain(item.expected);
      for (const nodeId of item.expectedNodes ?? []) {
        expect(nodeIds.has(nodeId), `${item.id}: unknown node ${nodeId}`).toBe(true);
      }
    }
  });

  it('records why, source message, and a manual verdict for every case', () => {
    for (const item of data.cases) {
      expect(item.why.length, `${item.id} why`).toBeGreaterThan(10);
      if (item.source !== undefined) expect(item.source.startsWith('om_'), `${item.id} source`).toBe(true);
      expect(['usable', 'needs_improvement', 'unreviewed']).toContain(item.verdict ?? 'unreviewed');
    }
  });

  it('has a generated human-readable report', () => {
    expect(existsSync(join(root, 'docs', 'evals', 'main-agent-real-qa.md'))).toBe(true);
  });
});
