/**
 * Best-effort Mongolian -> English prompt translation for the Flux/Wan
 * generators.
 *
 * WHY THIS EXISTS: neither Flux (CLIP-L + T5-XXL text encoders) nor Wan
 * 2.2's text encoder are meaningfully trained on Mongolian Cyrillic text —
 * both are overwhelmingly English-data-trained, like nearly all diffusion
 * image/video models. A raw Mongolian prompt sent straight to the model
 * produces poor or unrelated results. This module translates the prompt
 * server-side, right before it's sent to RunPod, so users can type prompts
 * in Mongolian naturally.
 *
 * MN->EN translation is done via Claude Haiku first (see
 * claudeTranslateMongolianToEnglish() below), falling back to MyMemory's
 * free public translation API if Claude is unavailable/fails. This two-tier
 * setup exists because MyMemory was found (live, 2026-07-09) to badly
 * mistranslate Mongolian cultural/clothing vocabulary — e.g. "Монгол дээл"
 * ("Mongolian deel", the traditional robe) came back as "Mongolyn
 * Monastery", and "Монгол дээлтэй эмэгтэйийн зураг" came back as "Mongolian
 * Embroidery Thread". Since "дээл" never survived translation, Flux never
 * saw the word "deel" at all and generated generic/unrelated
 * fur-coat-and-brocade imagery instead of an actual deel — this was reported
 * by a user testing the new Mongolian-style LoRA and traced here by directly
 * querying the MyMemory API. Claude Haiku (already used by
 * src/libs/PromptEnhance.ts, so ANTHROPIC_API_KEY is already configured)
 * translates such terms correctly and is tried first; MyMemory remains as a
 * free fallback if the Anthropic API key is missing or the call fails, so
 * translation — and therefore generation — never hard-fails.
 */

// Mongolian Cyrillic uses the standard Cyrillic block plus a couple of
// Cyrillic Supplement letters (Өө, Үү) — U+0400-U+04FF covers both.
// eslint-disable-next-line regexp/no-obscure-range -- explicit Cyrillic code-point range, not obscure in context
const CYRILLIC_PATTERN = /[Ѐ-ӿ]/;

export function containsCyrillic(text: string): boolean {
  return CYRILLIC_PATTERN.test(text);
}

const MYMEMORY_ENDPOINT = 'https://api.mymemory.translated.net/get';
const TRANSLATE_TIMEOUT_MS = 6000;

async function myMemoryTranslate(text: string, langpair: string): Promise<string | null> {
  try {
    const url = `${MYMEMORY_ENDPOINT}?q=${encodeURIComponent(text)}&langpair=${langpair}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT_MS);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    const translated = data?.responseData?.translatedText;

    if (typeof translated === 'string' && translated.trim().length > 0) {
      return translated;
    }

    return null;
  } catch {
    return null;
  }
}

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
const CLAUDE_TRANSLATE_TIMEOUT_MS = 8000;

const CLAUDE_TRANSLATE_SYSTEM_PROMPT = [
  'Translate the given Mongolian (Cyrillic) text to English.',
  'This text is a prompt for an AI image/video generator, so accuracy on concrete visual and cultural terms matters a lot more than fluency — a wrong translation of a clothing or object name will make the generator draw the wrong thing entirely.',
  'In particular: "дээл" always means "deel" (the traditional Mongolian robe/coat with a diagonal front closure and sash belt) — never "monastery", "embroidery", or anything else. Translate other specific Mongolian cultural terms (e.g. clothing, food, objects, places) as precisely and concretely as you can, keeping well-known loanwords like "deel" untranslated if that is the accurate/standard English term.',
  'Respond with ONLY the English translation — no preamble, no quotation marks, no explanation.',
].join(' ');

/**
 * Translates `text` from Mongolian to English via Claude Haiku. Returns null
 * (never throws) if ANTHROPIC_API_KEY is missing, the request fails, times
 * out, or returns something unusable — callers should fall back to
 * myMemoryTranslate() in that case.
 */
async function claudeTranslateMongolianToEnglish(text: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLAUDE_TRANSLATE_TIMEOUT_MS);

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
        system: CLAUDE_TRANSLATE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: text }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    const translated = data?.content?.[0]?.text;

    if (typeof translated === 'string' && translated.trim().length > 0) {
      return translated.trim();
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Translates `text` from Mongolian to English if it contains any Cyrillic
 * characters; otherwise returns it unchanged (already-English prompts skip
 * translation entirely). Tries Claude Haiku first (accurate on Mongolian
 * cultural/clothing terms — see module comment above), falls back to
 * MyMemory, and falls back to the original text if both fail. Never throws —
 * a translation hiccup never blocks a generation.
 */
export async function translateMongolianToEnglish(text: string): Promise<string> {
  if (!containsCyrillic(text)) {
    return text;
  }

  const claudeResult = await claudeTranslateMongolianToEnglish(text);
  if (claudeResult) {
    return claudeResult;
  }

  const translated = await myMemoryTranslate(text, 'mn|en');
  return translated ?? text;
}

const CLAUDE_TRANSLATE_EN_MN_SYSTEM_PROMPT = [
  'Translate the given English text to Mongolian (Cyrillic script).',
  'This text is an AI image/video generation prompt being shown to a Mongolian user for review/editing, so it must read as natural, fluent Mongolian — not a stiff or garbled word-for-word translation.',
  'Respond with ONLY the Mongolian translation — no preamble, no quotation marks, no explanation, no English text.',
].join(' ');

/**
 * Translates `text` from English to Mongolian via Claude Haiku. Returns null
 * (never throws) if ANTHROPIC_API_KEY is missing, the request fails, times
 * out, or returns something unusable — callers should fall back to
 * myMemoryTranslate() in that case.
 */
async function claudeTranslateEnglishToMongolian(text: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLAUDE_TRANSLATE_TIMEOUT_MS);

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
        system: CLAUDE_TRANSLATE_EN_MN_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: text }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    const translated = data?.content?.[0]?.text;

    if (typeof translated === 'string' && translated.trim().length > 0) {
      return translated.trim();
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Translates `text` from English to Mongolian. Used by the prompt enhancer
 * (src/libs/PromptEnhance.ts) to give the user a readable, editable
 * Mongolian preview of Claude's English-language enhanced description — see
 * that module for why the enhancement itself is generated in English rather
 * than Mongolian (free-form Mongolian *writing* was unreliable; translating
 * already-written English is a much more constrained task and doesn't
 * exhibit the same failure mode). Tries Claude Haiku first for the same
 * accuracy reasons as translateMongolianToEnglish() above, falls back to
 * MyMemory, and falls back to the original English text if both fail — a
 * translation hiccup just means the preview box shows English instead of
 * Mongolian rather than breaking anything. Never throws.
 */
export async function translateEnglishToMongolian(text: string): Promise<string> {
  const claudeResult = await claudeTranslateEnglishToMongolian(text);
  if (claudeResult) {
    return claudeResult;
  }

  const translated = await myMemoryTranslate(text, 'en|mn');
  return translated ?? text;
}
