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
 * Uses MyMemory's free public translation API (no API key / account setup
 * required — https://mymemory.translated.net). Its free tier is capped at
 * roughly 5,000 words/day per calling IP; if that's exceeded, or the API is
 * slow/unreachable for any reason, this falls back to the original text
 * rather than blocking generation. If usage grows past this free tier, swap
 * this module's implementation for a paid provider (Google Cloud
 * Translation, DeepL, etc.) — the containsCyrillic()/translateMongolianToEnglish()
 * call sites elsewhere in the codebase won't need to change.
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

/**
 * Translates `text` from Mongolian to English if it contains any Cyrillic
 * characters; otherwise returns it unchanged (already-English prompts skip
 * the network call entirely). Never throws — any failure (timeout, network
 * error, quota exceeded, malformed response) silently falls back to the
 * original text so a translation hiccup never blocks a generation.
 */
export async function translateMongolianToEnglish(text: string): Promise<string> {
  if (!containsCyrillic(text)) {
    return text;
  }

  const translated = await myMemoryTranslate(text, 'mn|en');
  return translated ?? text;
}

/**
 * Translates `text` from English to Mongolian. Used by the prompt enhancer
 * (src/libs/PromptEnhance.ts) to give the user a readable, editable
 * Mongolian preview of Claude's English-language enhanced description — see
 * that module for why the enhancement itself is generated in English rather
 * than Mongolian. Never throws — any failure falls back to the original
 * (English) text, so a translation hiccup just means the preview box shows
 * English instead of Mongolian rather than breaking anything.
 */
export async function translateEnglishToMongolian(text: string): Promise<string> {
  const translated = await myMemoryTranslate(text, 'en|mn');
  return translated ?? text;
}
