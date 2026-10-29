import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { capabilityGraph } from './capability-graph.js';
import { findRepoRoot } from './paths.js';

const root = findRepoRoot();

describe('capability graph', () => {
  it('has unique node ids and valid edges', () => {
    const ids = new Set(capabilityGraph.nodes.map((node) => node.id));
    expect(ids.size).toBe(capabilityGraph.nodes.length);
    expect(capabilityGraph.nodes.length).toBeGreaterThanOrEqual(12);

    for (const edge of capabilityGraph.edges) {
      expect(ids.has(edge.from), `edge from ${edge.from}`).toBe(true);
      expect(ids.has(edge.to), `edge to ${edge.to}`).toBe(true);
      expect(edge.note.length).toBeGreaterThan(5);
    }
  });

  it('every node has actions, sources, and boundaries', () => {
    for (const node of capabilityGraph.nodes) {
      expect(node.actions.length, `${node.id} actions`).toBeGreaterThanOrEqual(2);
      expect(node.sources.length, `${node.id} sources`).toBeGreaterThanOrEqual(1);
      expect(node.boundaries.length, `${node.id} boundaries`).toBeGreaterThanOrEqual(1);
      expect(node.questions.length, `${node.id} questions`).toBeGreaterThanOrEqual(1);
    }
  });

  it('every cited source exists on disk', () => {
    for (const node of capabilityGraph.nodes) {
      for (const source of node.sources) {
        expect(existsSync(join(root, source.path)), `${node.id}: ${source.path}`).toBe(true);
      }
    }
    for (const route of capabilityGraph.routes) {
      for (const source of route.evidence) {
        expect(existsSync(join(root, source.path)), `${route.id}: ${source.path}`).toBe(true);
      }
    }
  });

  it('every checker command points at an existing script', () => {
    for (const node of capabilityGraph.nodes) {
      for (const checker of node.checkers) {
        const match = /node\s+(scripts\/[\w./-]+\.mjs)/.exec(checker.cmd);
        if (match === null) continue;
        expect(existsSync(join(root, match[1] ?? '')), `${node.id}: ${checker.cmd}`).toBe(true);
      }
    }
  });

  it('every route points at real nodes and has a first check', () => {
    const ids = new Set(capabilityGraph.nodes.map((node) => node.id));
    for (const route of capabilityGraph.routes) {
      expect(route.nodeIds.length).toBeGreaterThan(0);
      for (const id of route.nodeIds) expect(ids.has(id), `${route.id}: ${id}`).toBe(true);
      expect(route.firstCheck.length).toBeGreaterThan(10);
      expect(route.prescription.length).toBeGreaterThanOrEqual(2);
      expect(route.notWhen.length).toBeGreaterThan(0);
    }
  });

  it('keeps the four axes populated', () => {
    expect(capabilityGraph.axes.lifecycle).toHaveLength(8);
    expect(capabilityGraph.axes.dataLayers).toHaveLength(8);
    expect(capabilityGraph.axes.pillars).toHaveLength(3);
    expect(capabilityGraph.axes.agentStages).toHaveLength(7);
    expect(capabilityGraph.axes.deliveryLanes).toHaveLength(4);
    expect(capabilityGraph.axes.gates.map((gate) => gate.id)).toEqual([
      'G1',
      'G2',
      'G3',
      'G4',
      'G5',
    ]);
  });
});
