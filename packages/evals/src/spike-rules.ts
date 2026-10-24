import type { ReferenceAnalysis } from '@mas/shared';

export interface GroundTruth {
  /** Hook start is assumed to be 0; only the end is needed. */
  hookEndSec?: number;
  /** Beat start times in order. */
  beatStartSecs?: number[];
  hasVoiceover?: boolean;
  audioRights?: ReferenceAnalysis['audio']['rights'];
}

export interface Gate {
  name: string;
  ok: boolean;
  observed: string;
}

const TIMING_TOLERANCE_SEC = 0.5;
const MAX_LATENCY_MS = 90_000;

function meanAbsoluteError(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return n === 0 ? Number.POSITIVE_INFINITY : sum / n;
}

/**
 * The ADR 0007 gates, expressed as pure checks so the spike script and its tests
 * share one definition. A gate failure eliminates a candidate; it is never averaged.
 */
export function evaluateSpike(
  analysis: ReferenceAnalysis,
  truth: GroundTruth,
  latencyMs: number,
): { passed: boolean; gates: Gate[] } {
  const gates: Gate[] = [];

  if (truth.hookEndSec !== undefined) {
    const diff = Math.abs(analysis.hook.durationSec - truth.hookEndSec);
    gates.push({
      name: 'hook-timing',
      ok: diff <= TIMING_TOLERANCE_SEC,
      observed: `reported ${analysis.hook.durationSec}s vs truth ${truth.hookEndSec}s (Δ${diff.toFixed(2)}s)`,
    });
  }

  if (truth.beatStartSecs !== undefined) {
    const reported = analysis.beats.map((beat) => beat.startSec);
    const countsMatch = reported.length === truth.beatStartSecs.length;
    const mae = meanAbsoluteError(reported, truth.beatStartSecs);
    gates.push({
      name: 'beat-timing',
      ok: countsMatch && mae <= TIMING_TOLERANCE_SEC,
      observed: countsMatch
        ? `${reported.length} beats, MAE ${mae.toFixed(2)}s`
        : `${reported.length} beats reported vs ${truth.beatStartSecs.length} in truth`,
    });
  }

  if (truth.hasVoiceover !== undefined) {
    const reported = analysis.voiceover.length > 0;
    gates.push({
      name: 'voiceover-presence',
      ok: reported === truth.hasVoiceover,
      observed: `reported ${reported ? `${analysis.voiceover.length} segment(s)` : 'none'}, truth ${truth.hasVoiceover ? 'speech' : 'silent'}`,
    });
  }

  gates.push({
    name: 'audio-rights',
    ok: truth.audioRights === undefined || analysis.audio.rights === truth.audioRights,
    observed:
      truth.audioRights === undefined
        ? `reported ${analysis.audio.rights} (no ground truth)`
        : `reported ${analysis.audio.rights}, truth ${truth.audioRights}`,
  });

  gates.push({
    name: 'latency',
    ok: latencyMs <= MAX_LATENCY_MS,
    observed: `${latencyMs}ms (limit ${MAX_LATENCY_MS}ms)`,
  });

  return { passed: gates.every((gate) => gate.ok), gates };
}
