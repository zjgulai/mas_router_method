import { describe, expect, it } from 'vitest';
import type { ReferenceAnalysis } from '@mas/shared';
import { evaluateSpike } from './spike-rules.js';

const analysis: ReferenceAnalysis = {
  hook: { pattern: 'problem-agitation', text: 'Hook', durationSec: 2, whyItWorks: 'Pain' },
  beats: [
    { name: 'problem', startSec: 2, endSec: 8, purpose: 'Agitate' },
    { name: 'mechanism', startSec: 8, endSec: 16, purpose: 'Show' },
  ],
  shots: [{ index: 0, kind: 'a-roll', startSec: 0, endSec: 8, action: 'Mirror', reuse: 'reshoot-required' }],
  voiceover: [{ startSec: 2, endSec: 8, line: 'It used to take an hour.' }],
  audio: { source: 'voiceover', rights: 'clearable' },
  captionFormula: { template: 'a', example: 'b', hashtagStrategy: 'c' },
  callToAction: { text: 'Try it', mechanism: 'Low effort' },
  transferability: { score: 0.7, blockers: [] },
};

describe('spike gates', () => {
  it('passes when timings, speech, and rights match', () => {
    const result = evaluateSpike(analysis, { hookEndSec: 2, beatStartSecs: [2, 8], hasVoiceover: true, audioRights: 'clearable' }, 5_000);
    expect(result.passed).toBe(true);
  });

  it('fails when the hook timing is off by more than 0.5s', () => {
    const result = evaluateSpike(analysis, { hookEndSec: 3.2 }, 5_000);
    expect(result.passed).toBe(false);
    expect(result.gates.find((g) => g.name === 'hook-timing')?.ok).toBe(false);
  });

  it('fails when beat starts drift', () => {
    const result = evaluateSpike(analysis, { beatStartSecs: [3, 9] }, 5_000);
    expect(result.passed).toBe(false);
    expect(result.gates.find((g) => g.name === 'beat-timing')?.ok).toBe(false);
  });

  it('fails when a silent reference gets invented voiceover', () => {
    const result = evaluateSpike(analysis, { hasVoiceover: false }, 5_000);
    expect(result.passed).toBe(false);
    expect(result.gates.find((g) => g.name === 'voiceover-presence')?.observed).toContain('1 segment');
  });

  it('fails when rights disagree with ground truth', () => {
    const result = evaluateSpike(analysis, { audioRights: 'not-reusable' }, 5_000);
    expect(result.passed).toBe(false);
  });

  it('fails when the call exceeds the timeout budget', () => {
    const result = evaluateSpike(analysis, {}, 91_000);
    expect(result.passed).toBe(false);
  });
});
