import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { BrandProfile, Recipe } from '@mas/shared';
import { err, guard, ok, toCallToolResult } from './result.js';

/**
 * Tools are defined against *ports* - small interfaces describing what the agent
 * needs - rather than against a database client. That inversion is what makes
 * the agent testable without a live Feishu tenant or a populated DB: evals wire
 * in fakes, production wires in the real thing, and the tool's prompt-visible
 * contract is identical in both.
 */
export interface BrandStore {
  get(brandId: string): Promise<BrandProfile | null>;
  listForUser(userId: string): Promise<BrandProfile[]>;
}

export interface ReferenceStore {
  save(
    brandId: string,
    input: {
      url: string;
      platformVideoId?: string;
      /** Raw engagement counts. Optional fields, not a loose record: the shape is the contract. */
      metrics?: {
        views?: number | undefined;
        likes?: number | undefined;
        comments?: number | undefined;
        shares?: number | undefined;
      };
    },
  ): Promise<{ referenceId: string }>;
  list(brandId: string): Promise<{ referenceId: string; url: string; analysed: boolean }[]>;
  /** Analysis is the durable artifact; the source video is never stored (ADR 0006). */
  saveAnalysis(brandId: string, referenceId: string, analysis: unknown): Promise<void>;
  getAnalysis(brandId: string, referenceId: string): Promise<unknown | null>;
}

export interface VisionAnalyzer {
  /** Returns a *validated* ReferenceAnalysis or throws; the tool converts throws to errors. */
  analyze(input: { url: string; brandContext: string }): Promise<unknown>;
}

export interface RecipeStore {
  saveDraft(input: {
    brandId: string;
    referenceId: string;
    recipe: unknown;
  }): Promise<{ recipeId: string }>;
  getRecipe(brandId: string, recipeId: string): Promise<unknown | null>;
  /** Newest first; scoped by brand (ADR 0009). */
  listRecipes(brandId: string, limit?: number): Promise<Recipe[]>;
}

export interface ToolDeps {
  brands: BrandStore;
  references: ReferenceStore;
  vision: VisionAnalyzer;
  recipes: RecipeStore;
  /** Scoped to the run: every tool call is attributable to a brand and an actor. */
  scope: { brandId: string; actorId: string };
}

/**
 * The toolset is the product's real surface area. An agent is only as good as
 * the verbs you give it, so this list is kept short and each entry is a decision:
 * anything the model could infer on its own is deliberately absent.
 */
export function createBrandTools(deps: ToolDeps) {
  const getBrandProfile = tool(
    'get_brand_profile',
    [
      'Load the brand profile for the current brand: voice, audience, market, guardrails, and success criteria.',
      'Call this FIRST, before analysing any reference video or writing anything. Every later decision depends on',
      'the guardrails it returns, and skipping it is how an agent produces an on-brand-sounding post that breaks a',
      'regulated-claims rule.',
    ].join(' '),
    {},
    async () =>
      toCallToolResult(
        await guard(async () => {
          const brand = await deps.brands.get(deps.scope.brandId);
          if (!brand) return err(`No brand profile found for ${deps.scope.brandId}.`, false);
          return ok(JSON.stringify(brand), { brand: brand as unknown as Record<string, unknown> });
        }),
      ),
    { annotations: { readOnlyHint: true } },
  );

  const saveReference = tool(
    'save_reference_video',
    [
      'Record a TikTok video as a reference for the current brand, without analysing it.',
      'Use this when the user pastes a link but you are not ready to analyse - for example when they paste five',
      'links at once and you want to confirm the list before spending analysis budget on each.',
    ].join(' '),
    {
      url: z.string().url().describe('The full TikTok video URL.'),
      platformVideoId: z
        .string()
        .optional()
        .describe('The numeric video id parsed from the URL, when you can see it.'),
      metrics: z
        .object({
          views: z.number().int().nonnegative().optional(),
          likes: z.number().int().nonnegative().optional(),
          comments: z.number().int().nonnegative().optional(),
          shares: z.number().int().nonnegative().optional(),
        })
        .optional()
        .describe(
          'Engagement numbers if the user or a scrape provided them. Omit rather than guessing.',
        ),
    },
    async (args) =>
      toCallToolResult(
        await guard(async () => {
          const saved = await deps.references.save(deps.scope.brandId, {
            url: args.url,
            ...(args.platformVideoId ? { platformVideoId: args.platformVideoId } : {}),
            ...(args.metrics ? { metrics: args.metrics } : {}),
          });
          return ok(`Saved reference ${saved.referenceId}.`, { referenceId: saved.referenceId });
        }),
      ),
    { annotations: { readOnlyHint: false } },
  );

  const listReferences = tool(
    'list_reference_videos',
    'List the reference videos already saved for the current brand, and whether each has been analysed.',
    {},
    async () =>
      toCallToolResult(
        await guard(async () => {
          const rows = await deps.references.list(deps.scope.brandId);
          if (rows.length === 0) return ok('No reference videos saved for this brand yet.');
          const text = rows
            .map((r) => `- ${r.referenceId} ${r.url} ${r.analysed ? '(analysed)' : '(not analysed)'}`)
            .join('\n');
          return ok(text, { references: rows as unknown as Record<string, unknown> });
        }),
      ),
    { annotations: { readOnlyHint: true } },
  );

  const analyzeReference = tool(
    'analyze_reference_video',
    [
      'Analyse a saved TikTok reference video and persist a structured breakdown: hook pattern, beat skeleton,',
      'shot list, voiceover, audio rights, caption formula, and how transferable it is to this brand.',
      'Call this before writing a recipe - the recipe writer is not allowed to invent an analysis.',
      'The result is cached on the reference; calling it twice costs money but returns the same shape.',
    ].join(' '),
    {
      referenceId: z
        .string()
        .min(1)
        .describe('A reference id previously returned by save_reference_video.'),
      brandContext: z
        .string()
        .min(1)
        .describe(
          'One or two sentences on what this brand sells and who watches it. Passed to the analyser so ' +
            'it can judge transferability; do not paste the whole brand profile here.',
        ),
    },
    async (args) =>
      toCallToolResult(
        await guard(async () => {
          const references = await deps.references.list(deps.scope.brandId);
          const found = references.find((r) => r.referenceId === args.referenceId);
          if (!found) {
            return err(
              `No reference ${args.referenceId} for this brand. Call list_reference_videos to see valid ids.`,
              false,
            );
          }
          // The analyser is the only component allowed to produce a ReferenceAnalysis,
          // and it validates before returning. A malformed analysis must not reach the
          // recipe writer, where it would silently become a bad script.
          const analysis = await deps.vision.analyze({
            url: found.url,
            brandContext: args.brandContext,
          });
          return ok(JSON.stringify(analysis), { analysis: analysis as Record<string, unknown> });
        }),
      ),
    { annotations: { readOnlyHint: false }, alwaysLoad: true },
  );

  const saveRecipeDraft = tool(
    'save_recipe_draft',
    [
      'Persist a draft recipe for human review. This is the deliverable of the whole workflow.',
      'A recipe is the cloneable abstraction of the reference video, re-skinned for this brand: hook, beats,',
      'caption, hashtags, and audio direction. Do not call this until analyze_reference_video has returned,',
      'and do not mark anything as reviewed or approved - only a human can do that.',
    ].join(' '),
    {
      referenceId: z.string().min(1),
      title: z
        .string()
        .min(1)
        .max(120)
        .describe('Internal working title, e.g. "August launch - result-first hook".'),
      abstractionDistance: z
        .number()
        .min(0)
        .max(1)
        .describe(
          'How far this strays from the reference: 0 means a near-literal copy, 1 means only the abstract ' +
            'pattern survived. Above 0.9, expect a reviewer to ask whether the reference still matters. ' +
            'Report the honest, defensible value for what you actually produced — keep every structural beat ' +
            '(hook, beat order, pacing) that was kept, and count only the layers you swapped (subject, setting, ' +
            'product, dialogue). Do not round the number toward what you think the requester wants.',
        ),
      exclusions: z
        .array(
          z.object({
            element: z.string().min(1).describe('Something from the reference you deliberately left out.'),
            reason: z.string().min(1).describe('Why. Rights, brand fit, audience mismatch - be specific.'),
          }),
        )
        .default([])
        .describe('Elements dropped from the reference and why. Reviewers read this first.'),
      hook: z.object({
        text: z.string().min(1).describe('The spoken/opening line, at most ~2 seconds of speech.'),
        onScreenText: z.string().optional(),
        durationSec: z.number().positive().max(5),
        pattern: z
          .string()
          .min(1)
          .describe('The hook pattern reused from the analysis, e.g. "curiosity-gap".'),
      }),
      beats: z
        .array(
          z.object({
            kind: z.enum([
              'hook',
              'context',
              'problem',
              'mechanism',
              'proof',
              'objection-handling',
              'cta',
            ]),
            durationSec: z.number().positive(),
            script: z.string().min(1).describe('What is said. Write it as it will be spoken.'),
            translation: z
              .string()
              .optional()
              .describe(
                'The market-locale line for this beat. Required whenever the reference (or the request) ' +
                  'involves another language — e.g. a zh reference for a US launch needs a translation on every spoken beat.',
              ),
            visual: z
              .string()
              .min(1)
              .describe('What the camera sees. A shooter must be able to act on this.'),
            onScreenText: z.string().optional(),
            derivedFromShotIndex: z.number().int().nonnegative().optional(),
          }),
        )
        .min(2)
        .describe(
            'Ordered beats. Together with the hook they should land in the 15-45s window. ' +
              'For a silent reference (analysis has no voiceover), every beat is on-screen text: ' +
              'set onScreenText and make script the exact same string — no invented spoken lines.',
          ),
      caption: z.string().min(1).max(2200),
      hashtags: z.array(z.string()).default([]),
      audio: z.object({
        direction: z
          .string()
          .min(1)
          .describe('What audio should play, and why that choice serves the video.'),
        rights: z
          .enum(['original', 'platform-library', 'licensed', 'unknown'])
          .describe(
            'The rights basis of the audio you are actually directing. original = voice recorded for ' +
              'this video; platform-library = a stock/commercial-library bed; licensed = a cleared licence. ' +
              'unknown is only for a genuinely undecidable case — when the reference audio is restricted ' +
              '(not-reusable), name the replacement and give ITS basis; that is a decided choice, not unknown.',
          ),
      }),
      selfCheck: z
        .object({
          brandVoiceMatch: z.number().min(0).max(1),
          hookStrength: z.number().min(0).max(1),
          claimsSubstantiated: z
            .boolean()
            .describe(
              'True only if every factual claim in the script traces to something the brand can prove.',
            ),
          notes: z.string().optional(),
        })
        .optional()
        .describe(
          'Your own assessment. It is recorded, not trusted - an eval gate decides whether this ships.',
        ),
    },
    async (args) =>
      toCallToolResult(
        await guard(async () => {
          const saved = await deps.recipes.saveDraft({
            brandId: deps.scope.brandId,
            referenceId: args.referenceId,
            recipe: args,
          });
          return ok(`Saved recipe draft ${saved.recipeId} for review.`, {
            recipeId: saved.recipeId,
          });
        }),
      ),
    { alwaysLoad: true },
  );

  return [getBrandProfile, saveReference, listReferences, analyzeReference, saveRecipeDraft];
}

/**
 * Names the runtime must allow. Derived rather than hand-listed: a tool added
 * above without a corresponding permission entry is a silent no-op, which is the
 * hardest class of agent bug to notice.
 */
export function brandToolNames(serverName = 'brand'): string[] {
  return [
    'get_brand_profile',
    'save_reference_video',
    'list_reference_videos',
    'analyze_reference_video',
    'save_recipe_draft',
  ].map((name) => `mcp__${serverName}__${name}`);
}
