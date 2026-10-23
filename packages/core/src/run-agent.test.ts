import { describe, expect, it } from 'vitest';
import { recipeDurationSec, TARGET_DURATION_SEC } from '@mas/shared';
import { createStepRecorder, guard, toCallToolResult } from './tools/result.js';
import { messageToSteps } from './run-agent.js';

/**
 * These tests target the two places where agent products silently rot: the
 * tool-result contract (a thrown error kills a run) and the step mapping (a
 * missing step makes a failed run unexplainable).
 */

describe('tool result contract', () => {
  it('keeps a thrown error inside the agent loop', async () => {
    const outcome = await guard(async () => {
      throw new Error('vision API 502');
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    // A crash is not the model's fault, so it must not be reported as a retryable input error.
    expect(outcome.retryable).toBe(false);
    expect(outcome.text).toContain('vision API 502');
  });

  it('marks an ok outcome as not-an-error for the MCP transport', () => {
    const result = toCallToolResult({ ok: true, text: 'done' });
    expect(result.isError).toBe(false);
    expect(result.content[0]?.text).toBe('done');
    expect(result.structuredContent).toBeUndefined();
  });

  it('carries structured payloads through unchanged', () => {
    const result = toCallToolResult({ ok: true, text: 'see data', data: { recipeId: 'rec_abc' } });
    expect(result.structuredContent).toEqual({ recipeId: 'rec_abc' });
  });
});

describe('step recorder', () => {
  it('numbers steps in the order they happened', () => {
    const rec = createStepRecorder(() => new Date('2026-01-01T00:00:00Z'));
    rec.record({ kind: 'assistant-text', summary: 'first' });
    rec.record({ kind: 'tool-call', tool: 'get_brand_profile', summary: '{}' });

    const steps = rec.all();
    expect(steps.map((s) => s.index)).toEqual([0, 1]);
    expect(steps[0]?.at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('does not expose its internal array', () => {
    const rec = createStepRecorder();
    rec.record({ kind: 'assistant-text', summary: 'x' });
    rec.all().push({ index: 99, at: '2026-01-01T00:00:00Z', kind: 'error', summary: 'injected' });
    expect(rec.all()).toHaveLength(1);
  });
});

describe('messageToSteps', () => {
  it('renders a tool_result carried on a user message', () => {
    const rec = createStepRecorder();
    messageToSteps(
      {
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 't1', content: 'brand loaded' }],
        },
        parent_tool_use_id: null,
        uuid: '11111111-1111-1111-1111-111111111111',
        session_id: 's1',
      } as never,
      rec,
    );
    expect(rec.all()[0]?.kind).toBe('tool-result');
    expect(rec.all()[0]?.summary).toBe('brand loaded');
  });

  it('ignores message kinds it does not render', () => {
    const rec = createStepRecorder();
    messageToSteps({ type: 'stream_event' } as never, rec);
    expect(rec.all()).toEqual([]);
  });
});

describe('recipe duration', () => {
  const recipe = {
    hook: { text: 'h', durationSec: 3, pattern: 'curiosity-gap' },
    beats: [
      { kind: 'problem' as const, durationSec: 10, script: 'a', visual: 'b' },
      { kind: 'cta' as const, durationSec: 7, script: 'c', visual: 'd' },
    ],
  };

  it('sums the hook and every beat', () => {
    expect(recipeDurationSec(recipe)).toBe(20);
  });

  it('lands inside the product target window', () => {
    const total = recipeDurationSec(recipe);
    expect(total).toBeGreaterThanOrEqual(TARGET_DURATION_SEC.min);
    expect(total).toBeLessThanOrEqual(TARGET_DURATION_SEC.max);
  });
});
