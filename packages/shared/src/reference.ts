import { z } from 'zod';

/**
 * A reference video is a *viral* TikTok post the brand wants to clone. We never
 * store the media itself in this schema — only the derived analysis. Media lives
 * behind a signed URL and expires; the analysis is what the product actually
 * sells, and it must survive the source being deleted.
 */
export const ReferenceSource = z.object({
  platform: z.literal('tiktok'),
  /** Canonical TikTok video id, when the URL could be resolved. */
  platformVideoId: z.string().optional(),
  url: z.string().url(),
  capturedAt: z.string().datetime({ offset: true }),
  /** Engagement snapshot at capture time. Numbers, not percentages: raw is auditable. */
  metrics: z
    .object({
      views: z.number().int().nonnegative(),
      likes: z.number().int().nonnegative(),
      comments: z.number().int().nonnegative(),
      shares: z.number().int().nonnegative(),
      saves: z.number().int().nonnegative().optional(),
    })
    .partial()
    .optional(),
});
export type ReferenceSource = z.infer<typeof ReferenceSource>;

/**
 * The hook is the first 1-3 seconds. It is the single highest-leverage element
 * in short-form video and the one most often got wrong by a generic LLM, so it
 * gets its own typed shape rather than living inside free text.
 */
export const HookPattern = z.enum([
  'curiosity-gap', // states a surprising premise, withholds the payoff
  'pattern-interrupt', // visual or audio jolt; breaks the feed's rhythm
  'direct-callout', // addresses the viewer's identity ("if you're a ...")
  'problem-agitation', // names a pain the viewer already feels
  'result-first', // shows the end state, then rewinds
  'contrarian-claim', // contradicts received wisdom
  'ugc-confession', // first-person, low-production honesty
]);
export type HookPattern = z.infer<typeof HookPattern>;

export const VoiceoverSegment = z.object({
  /** Seconds from the start of the video. */
  startSec: z.number().nonnegative(),
  endSec: z.number().nonnegative(),
  /** What is said, normalised to the language it is spoken in. */
  line: z.string().min(1),
  /** Literal translation, when the spoken language differs from the brand's market. */
  translation: z.string().optional(),
  onScreenText: z.string().optional(),
});
export type VoiceoverSegment = z.infer<typeof VoiceoverSegment>;

export const ShotKind = z.enum([
  'a-roll', // talking head / subject on camera
  'b-roll', // supporting footage
  'product-closeup',
  'screen-recording',
  'text-on-screen',
  'transition',
  'cta-card',
]);
export type ShotKind = z.infer<typeof ShotKind>;

export const Shot = z.object({
  index: z.number().int().nonnegative(),
  kind: ShotKind,
  startSec: z.number().nonnegative(),
  endSec: z.number().nonnegative(),
  /** Camera and framing direction, in the language a shooter can act on. */
  camera: z.string().optional(),
  action: z.string().min(1),
  /** Where this shot can be reused versus re-shot. Drives the production plan. */
  reuse: z.enum(['reusable', 'reshoot-required']),
});
export type Shot = z.infer<typeof Shot>;

/**
 * The analysis is the LLM's structured reading of a reference. It is produced by
 * exactly one tool in the agent runtime (`analyze_reference_video`) and is the
 * only input the recipe writer is allowed to trust.
 */
export const ReferenceAnalysis = z.object({
  hook: z.object({
    pattern: HookPattern,
    /** Verbatim opening line, or a visual description when there is no speech. */
    text: z.string().min(1),
    durationSec: z.number().positive(),
    whyItWorks: z.string().min(1),
  }),
  /** Narrative beats, in order. The recipe reuses this skeleton, not the words. */
  beats: z
    .array(
      z.object({
        name: z.string().min(1),
        startSec: z.number().nonnegative(),
        endSec: z.number().nonnegative(),
        purpose: z.string().min(1),
      }),
    )
    .min(2),
  shots: z.array(Shot).min(1),
  voiceover: z.array(VoiceoverSegment).default([]),
  audio: z.object({
    /** e.g. "trending sound", "original voiceover", "licensed track". */
    source: z.string().min(1),
    /** Rights status governs whether a brand can reuse the audio at all. */
    rights: z.enum(['clearable', 'platform-library-only', 'not-reusable', 'unknown']),
    bpm: z.number().positive().optional(),
  }),
  captionFormula: z.object({
    /** Abstracted pattern, e.g. "<pain>? <3-step fix> - <proof>". */
    template: z.string().min(1),
    example: z.string().min(1),
    hashtagStrategy: z.string().min(1),
  }),
  /** What the viewer is asked to do, and how the video earns it. */
  callToAction: z.object({
    text: z.string().min(1),
    mechanism: z.string().min(1),
  }),
  /** Honest limits - things a brand in a different category cannot copy. */
  transferability: z.object({
    score: z.number().min(0).max(1),
    blockers: z.array(z.string()).default([]),
  }),
});
export type ReferenceAnalysis = z.infer<typeof ReferenceAnalysis>;

export const ReferenceVideo = z.object({
  id: z.string(),
  source: ReferenceSource,
  analysis: ReferenceAnalysis.optional(),
  analysedAt: z.string().datetime({ offset: true }).optional(),
});
export type ReferenceVideo = z.infer<typeof ReferenceVideo>;
