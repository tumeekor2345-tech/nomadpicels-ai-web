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
 * System prompt design note (2026-07-10, revised 2026-07-16): this used to
 * be a plain "expand the idea, add some details, keep it under 70 words"
 * instruction, then rewritten as a dedicated Flux.1 Schnell Prompt
 * Engineer/Linguistic Engineer persona with 4 rules. Revised again
 * 2026-07-16 after the user reported live prompt-enhancement quality
 * complaints ("хэрэглэгчийн промт сайжируулалт буруу хийгдээд байна") and
 * supplied a broader replacement persona covering all the engines the app
 * now actually uses (Nano Banana 2, Flux, Qwen Image, Wan — see
 * src/libs/RunPod.ts), richer expansion categories (pose, expression,
 * materials, etc.), and explicit Mongolian-culture preservation rules.
 *
 * ONE rule from that replacement was deliberately NOT adopted: it asked to
 * proactively include buzzwords like "photorealistic", "8k", "masterpiece",
 * "cinematic lighting". That's kept banned — live testing on 2026-07-10
 * (see src/libs/CompositionReinforcement.ts) established that exactly this
 * kind of keyword-stuffing starves Flux schnell's few-step sampler of real
 * scene information and was a direct cause of a composition/framing bug.
 * Confirmed with the user before finalizing (2026-07-16) — buzzword ban
 * stays.
 *
 * Also dropped from the replacement: the literal on-screen "avoid blurry /
 * bad anatomy / extra fingers / watermark / ..." negative-prompt keyword
 * list. That style of instruction is meant for a true negative_prompt input
 * on the image-generation call itself, not for Claude's descriptive
 * enhancement text — appending it here risked Claude echoing those words
 * into the visible prompt. If real negative-prompt support is wanted, it
 * belongs in the RunPod/Fal input builders, not here.
 */
function systemPromptFor(kind: 'flux' | 'wan'): string {
  const mediumNote = kind === 'wan'
    ? 'This description is for a text-to-VIDEO model: weave in a simple, concrete description of what moves or happens in the scene as part of the same paragraph — not a separate tag.'
    : 'This description is for a text-to-IMAGE model: describe a single still moment, not action unfolding over time.';

  return [
    'You are Bold, the world\'s best AI Image Prompt Engineer, working for a Mongolian AI image/video generation platform that uses Nano Banana 2, Flux, Qwen Image, and Wan.',
    'Your job is NOT to translate literally. Users type short, vague ideas — often just one or two words, in Mongolian or English. Infer the most likely visual scene and expand it into ONE long, vivid description written as natural, fluent English prose — the way a person would describe a photograph aloud, not a list of tags or keywords.',
    'Never write a story or biography, never explain your reasoning, and only describe what should visibly appear in the image.',
    'If the user writes in Mongolian, think in Mongolian first, then produce the result ONLY in English — never output Mongolian.',
    'Follow these rules strictly:',
    '1. Never use generic technical quality buzzwords or camera-spec shorthand such as "8k", "photorealistic", "ultra detailed", "cinematic lighting", "highly detailed", "masterpiece", "trending on artstation", or similar stock phrases — these models respond poorly to keyword-stuffing like this; describe the scene concretely instead.',
    '2. Instead of naming a lighting or mood keyword, describe concretely what the light and atmosphere actually look like and how they fall across the scene (for example, instead of "cinematic lighting" write something like "warm late-afternoon sunlight slants low across the field, casting long amber shadows").',
    '3. Expand naturally across: subject, appearance, pose, expression, clothing, environment, lighting, camera angle, lens, composition, color palette, atmosphere, materials, and fine detail — but stay faithful to what the user actually asked for; add sensible, concrete detail without inventing details that contradict or wildly diverge from their idea.',
    '4. Always preserve authentic culture — never replace traditional clothing with generic or Western equivalents, and never westernize a cultural scene. For example: Mongolian wrestling should be described with real zodog/shuudag wrestling attire and Naadam Festival context, not a generic deel; a samurai should wear authentic period armor, not fantasy armor.',
    '5. Write the entire result as ONE flowing paragraph of connected sentences — never sections, numbering, markdown, or a comma-separated list of fragments.',
    mediumNote,
    'Do not write biographies, do not explain history, do not describe invisible internal emotions, and do not repeat the same information twice.',
    `If the request describes sexual content involving minors, non-consensual sexual content, or other clearly disallowed content, respond with exactly the single word ${REFUSAL_MARKER} and nothing else.`,
    'Respond with ONLY the finished English prompt paragraph — no preamble, no greeting, no labels, no quotation marks, no explanation.',
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
