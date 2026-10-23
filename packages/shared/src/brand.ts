import { z } from 'zod';

/**
 * A brand profile is the agent's standing brief. It is deliberately structured
 * rather than a blob of prose: every field here is something a tool reads, and
 * a field that no tool reads does not belong in it.
 */
export const BrandVoice = z.object({
  /** How the brand sounds, phrased so a writer can imitate it. */
  tone: z.array(z.string().min(1)).min(1),
  /** Words and claims the brand must never use. Enforced at generation time. */
  banned: z.array(z.string()).default([]),
  /** Signature phrases worth carrying across posts. */
  catchphrases: z.array(z.string()).default([]),
});
export type BrandVoice = z.infer<typeof BrandVoice>;

export const BrandProfile = z.object({
  id: z.string(),
  name: z.string().min(1),
  /** Primary market. Drives language, currency, and platform-region rules. */
  market: z.object({
    primaryLocale: z.string().min(2),
    additionalLocales: z.array(z.string()).default([]),
    currency: z.string().length(3),
  }),
  category: z.string().min(1),
  /** The audience, as constraints rather than demographics for their own sake. */
  audience: z.object({
    description: z.string().min(1),
    /** Situations the audience is in when they watch. Shapes hook choice. */
    contexts: z.array(z.string()).default([]),
    objections: z.array(z.string()).default([]),
  }),
  voice: BrandVoice,
  /** Hard constraints the agent cannot talk its way out of. */
  guardrails: z.object({
    /** Claims that require substantiation before they can ship. */
    regulatedClaims: z.array(z.string()).default([]),
    /** Topics to stay away from entirely. */
    prohibitedTopics: z.array(z.string()).default([]),
    /** Required disclaimers, keyed by the claim they attach to. */
    requiredDisclaimers: z.record(z.string(), z.string()).default({}),
  }),
  /** What "good" means for this brand, as observable criteria. */
  successCriteria: z
    .array(
      z.object({
        name: z.string().min(1),
        /** How a reviewer or an LLM judge decides pass/fail. */
        rubric: z.string().min(1),
        weight: z.number().min(0).max(1),
      }),
    )
    .default([]),
});
export type BrandProfile = z.infer<typeof BrandProfile>;
