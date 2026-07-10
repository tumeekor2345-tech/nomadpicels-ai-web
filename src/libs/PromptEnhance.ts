/**
 * AI-assisted prompt enhancement for users who type a short or vague idea for
 * their AI Image/Video generation (e.g. "морь унасан хүн" instead of a full,
 * detailed prompt). Calls Claude (Anthropic Messages API) to expand the
 * user's idea into a single, detailed prompt — written in ENGLISH.
 *
 * Why English and not Mongolian: an earlier version asked Claude to write
 * the enhanced description directly in Mongolian, since that's what the user
 * needs to read/edit. In practice Claude Haiku's free-form Mongolian writing
 * is unreliable — it produced incoherent, word-salad text often enough to be
 * a real problem (reported by a live user: nonsense phrases like "эвэртэй
 * туулай" showing up in otherwise unrelated descriptions). Haiku's English
 * writing is strong, and English is also what Flux/Wan actually consume. So
 * this module always produces English, and the route handler
 * (src/app/api/generate/enhance-prompt/route.ts) translates that English
 * text to Mongolian via src/libs/Translate.ts's translateEnglishToMongolian()
 * purely for display/editing — translation is a much more constrained task
 * than free creative writing and doesn't exhibit the same failure mode.
 *
 * This is always a user-initiated preview ("Санаагаа сайжруул" button in
 * GenerateForm): the user sees the Mongolian preview (editable) plus the
 * underlying English text, and explicitly approves it before it replaces
 * their prompt text — never applied silently, unlike src/libs/Translate.ts's
 * automatic translation at generation time.
 *
 * Requires ANTHROPIC_API_KEY to be set (Vercel project env vars, or
 * .env.local for local dev). Get a key at https://console.anthropic.com.
 * If the key is missing, enhancePrompt() returns { ok: false, reason:
 * 'not_configured' } rather than throwing, so the rest of the app keeps
 * working — the button just won't do anything useful until the key is added.
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
const ENHANCE_TIMEOUT_MS = 15000;
const REFUSAL_MARKER = 'REFUSED';

/**
 * System prompt design note (2026-07-10): this used to be a plain
 * "expand the idea, add some details, keep it under 70 words" instruction.
 * Rewritten at the user's explicit request to make Claude act as a
 * dedicated Flux.1 Schnell Prompt Engineer / Linguistic Engineer, following
 * four rules she specified directly:
 *   1. No generic technical quality buzzwords (8k, photorealistic, ultra
 *      detailed, cinematic lighting, etc.) — Flux responds poorly to
 *      keyword-stuffing; it wants natural descriptive language instead.
 *   2. Describe light/mood/atmosphere as concrete sensory description
 *      ("warm late-afternoon sunlight slants low across the field...")
 *      rather than naming a lighting style as a keyword.
 *   3. Any literal on-scene text (signs, labels) must be quoted exactly.
 *   4. The whole result must read as ONE flowing paragraph, never a
 *      comma-separated tag list.
 * This pairs with — and is a big part of why the earlier tight bust-crop
 * framing bug happened — the composition reinforcement work done the same
 * day (src/libs/CompositionReinforcement.ts): tag-soup prompts with
 * technical stopwords up front are exactly the kind of input that starves
 * Flux schnell's few-step sampler of real scene information. Natural,
 * concrete, single-paragraph descriptions are expected to compose better
 * with that fix, not fight it.
 */
function systemPromptFor(kind: 'flux' | 'wan'): string {
  const mediumNote = kind === 'wan'
    ? 'This description is for a text-to-VIDEO model: weave in a simple, concrete description of what moves or happens in the scene as part of the same paragraph — not a separate tag.'
    : 'This description is for a text-to-IMAGE model: describe a single still moment, not action unfolding over time.';

  return [
    'You are Bold, a highly experienced Prompt Engineer and Linguistic Engineer specializing in prompts for the Flux.1 Schnell image generation model, working for a Mongolian AI image/video generation platform.',
    'Users type short, vague ideas for what they want to generate, in Mongolian or English. Your job is to expand each idea into ONE long, detailed, vivid description written as natural, fluent English prose — the way a person would describe a photograph aloud, not a list of tags or keywords.',
    'Follow these rules strictly:',
    '1. Never use generic technical quality buzzwords or camera-spec shorthand such as "8k", "photorealistic", "ultra detailed", "cinematic lighting", "highly detailed", "masterpiece", "trending on artstation", or similar stock phrases — Flux responds poorly to keyword-stuffing like this.',
    '2. Instead of naming a lighting or mood keyword, describe concretely what the light and atmosphere actually look like and how they fall across the scene (for example, instead of "cinematic lighting" write something like "warm late-afternoon sunlight slants low across the field, casting long amber shadows").',
    '3. If the idea implies visible text, a sign, a label, or writing appearing in the scene, quote that exact text using double quotes (for example: a neon sign that reads "Ulaanbaatar").',
    '4. Write the entire result as ONE flowing paragraph of connected sentences describing subject, setting, light, atmosphere, and composition — never a comma-separated list of fragments.',
    mediumNote,
    'Stay faithful to what the user actually asked for — add sensible, concrete detail, but do not invent details that contradict or wildly diverge from their idea.',
    `If the request describes sexual content involving minors, non-consensual sexual content, or other clearly disallowed content, respond with exactly the single word ${REFUSAL_MARKER} and nothing else.`,
    'Respond with ONLY the finished English prompt paragraph — no preamble, no greeting, no labels, no quotation marks wrapping the whole paragraph, no explanation.',
  ].join(' ');
}

export type EnhanceResult
  = | { ok: true; enhancedPrompt: string }
    | { ok: false; reason: 'blocked' | 'not_configured' | 'failed' };

/**
 * Expands `rawPrompt` into a detailed English description via Claude Haiku.
 * Never throws — any failure (missing key, timeout, network error,
 * malformed response) is reported as a typed failure reason instead.
 */
export async function enhancePrompt(rawPrompt: string, kind: 'flux' | 'wan'): Promise<EnhanceResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ENHANCE_TIMEOUT_MS);

    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 500,
        system: systemPromptFor(kind),
        messages: [{ role: 'user', content: rawPrompt }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { ok: false, reason: 'failed' };
    }

    const data = await res.json();
    const text = data?.content?.[0]?.text;

    if (typeof text !== 'string' || text.trim().length === 0) {
      return { ok: false, reason: 'failed' };
    }

    const trimmed = text.trim();
    if (trimmed === REFUSAL_MARKER || trimmed.startsWith(REFUSAL_MARKER)) {
      return { ok: false, reason: 'blocked' };
    }

    return { ok: true, enhancedPrompt: trimmed };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
