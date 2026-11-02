/**
 * Intent router: a message either asks the recipe agent (turn this TikTok into
 * a brand recipe) or the consult agent (answer a question). TikTok URLs are a
 * strong signal — the consult agent cannot do anything useful with one — and
 * the `/recipe` prefix is the explicit override when the url is absent.
 *
 * This is a code-level route, not a model judgement: misrouting costs one
 * mediocre consult answer, which is cheap.
 */
const TIKTOK_VIDEO = /(?:https?:\/\/)?(?:www\.|m\.)?tiktok\.com\/@[\w.-]+\/video\/\d+/i;
const TIKTOK_SHORT = /(?:https?:\/\/)?vt\.tiktok\.com\/[\w-]+/i;
const RECIPE_PREFIX = /^\s*\/recipe\b/i;

export function isRecipeIntent(text: string): boolean {
  return RECIPE_PREFIX.test(text) || TIKTOK_VIDEO.test(text) || TIKTOK_SHORT.test(text);
}
