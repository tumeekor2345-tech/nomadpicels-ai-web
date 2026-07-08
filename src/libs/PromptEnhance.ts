/**
 * AI-assisted prompt enhancement for users who type a short or vague idea for
 * their AI Image/Video generation (e.g. "морь унасан хүн" instead of a full,
 * detailed prompt). Calls Claude (Anthropic Messages API) to expand the
 * user's idea into a single, detailed English prompt suitable for Flux
 * (image) or Wan 2.2 (video).
 *
 * This is always a user-initiated preview ("Санаагаа сайжруул" button in
 * GenerateForm) that the user explicitly approves before it replaces their
 * prompt text — never applied silently, unlike src/libs/Translate.ts.
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

function systemPromptFor(kind: 'flux' | 'wan'): string {
  const mediumNote = kind === 'wan'
    ? 'This is for a text-to-VIDEO model — include a simple, concrete description of motion or action.'
    : 'This is for a text-to-IMAGE model — describe a single still scene, not motion unfolding over time.';

  return [
    'You help users of a Mongolian AI image/video generation platform who type short, vague ideas for what they want to generate.',
    'Expand the user\'s idea (given in Mongolian or English) into ONE detailed, vivid prompt in English, suitable for a diffusion model.',
    'Add sensible, concrete details about subject, setting, lighting, mood, and composition — but do not invent details that contradict or wildly diverge from what the user asked for.',
    mediumNote,
    'Keep the result under 70 words.',
    `If the request describes sexual content involving minors, non-consensual sexual content, or other clearly disallowed content, respond with exactly the single word ${REFUSAL_MARKER} and nothing else.`,
    'Otherwise, respond with ONLY the enhanced prompt text — no preamble, no quotation marks, no explanation.',
  ].join(' ');
}

export type EnhanceResult
  = | { ok: true; enhancedPrompt: string }
    | { ok: false; reason: 'blocked' | 'not_configured' | 'failed' };

/**
 * Expands `rawPrompt` into a detailed English prompt via Claude Haiku. Never
 * throws — any failure (missing key, timeout, network error, malformed
 * response) is reported as a typed failure reason instead.
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
        max_tokens: 300,
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
