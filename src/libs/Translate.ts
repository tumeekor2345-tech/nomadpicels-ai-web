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
 * MN->EN translation is done via Gemini 3.5 Flash first (see
 * geminiTranslateMongolianToEnglish() below — ran on Claude Haiku until
 * 2026-07-16, switched at the user's request alongside
 * src/libs/PromptEnhance.ts, see that module's comment for why), falling
 * back to MyMemory's free public translation API if Gemini is
 * unavailable/fails. This two-tier setup exists because MyMemory was found
 * (live, 2026-07-09) to badly mistranslate Mongolian cultural/clothing
 * vocabulary — e.g. "Монгол дээл" ("Mongolian deel", the traditional robe)
 * came back as "Mongolyn Monastery", and "Монгол дээлтэй эмэгтэйийн зураг"
 * came back as "Mongolian Embroidery Thread". Since "дээл" never survived
 * translation, Flux never saw the word "deel" at all and generated
 * generic/unrelated fur-coat-and-brocade imagery instead of an actual deel —
 * this was reported by a user testing the new Mongolian-style LoRA and
 * traced here by directly querying the MyMemory API. Gemini (GEMINI_API_KEY,
 * already configured for src/libs/PromptEnhance.ts) translates such terms
 * correctly and is tried first; MyMemory remains as a free fallback if the
 * Gemini API key is missing or the call fails, so translation — and
 * therefore generation — never hard-fails.
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

    // MyMemory sometimes returns HTTP 200 with an error MESSAGE stuffed into
    // responseData.translatedText instead of a real translation — e.g.
    // "QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS" when the
    // input text is too long (its free tier caps `q` at 500 chars). Found
    // live 2026-07-10 after PromptEnhance.ts started producing longer
    // single-paragraph descriptions: the error string was passed straight
    // through as if it were the Mongolian translation and shown to the user.
    // Guard against both that specific case and a non-200 responseStatus.
    if (data?.responseStatus && data.responseStatus !== 200) {
      return null;
    }
    if (typeof translated === 'string' && /QUERY LENGTH LIMIT EXCEEDED/i.test(translated)) {
      return null;
    }

    if (typeof translated === 'string' && translated.trim().length > 0) {
      return translated;
    }

    return null;
  } catch {
    return null;
  }
}

const GEMINI_MODEL = 'gemini-3.5-flash';
const GEMINI_TRANSLATE_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const GEMINI_TRANSLATE_TIMEOUT_MS = 8000;

const GEMINI_TRANSLATE_SYSTEM_PROMPT = [
  'Translate the given Mongolian (Cyrillic) text to English.',
  'This text is a prompt for an AI image/video generator, so accuracy on concrete visual and cultural terms matters a lot more than fluency — a wrong translation of a clothing or object name will make the generator draw the wrong thing entirely.',
  'In particular: "дээл" always means "deel" (the traditional Mongolian robe/coat with a diagonal front closure and sash belt) — never "monastery", "embroidery", or anything else. Translate other specific Mongolian cultural terms (e.g. clothing, food, objects, places) as precisely and concretely as you can, keeping well-known loanwords like "deel" untranslated if that is the accurate/standard English term.',
  'Respond with ONLY the English translation — no preamble, no quotation marks, no explanation.',
].join(' ');

/**
 * Translates `text` from Mongolian to English via Gemini 3.5 Flash. Returns
 * null (never throws) if GEMINI_API_KEY is missing, the request fails, times
 * out, or returns something unusable (including a Gemini-side safety block)
 * — callers should fall back to myMemoryTranslate() in that case.
 */
async function geminiTranslateMongolianToEnglish(text: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TRANSLATE_TIMEOUT_MS);

    const res = await fetch(GEMINI_TRANSLATE_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: GEMINI_TRANSLATE_SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text }] }],
        // thinkingConfig + raised maxOutputTokens added 2026-07-16 — same
        // fix, same reason as src/libs/PromptEnhance.ts's enhancePrompt():
        // gemini-3.5-flash thinks by default and thinking tokens are drawn
        // from maxOutputTokens, so a low budget with no thinkingConfig risks
        // the exact same silent mid-translation truncation. Translation
        // needs no multi-step reasoning, so thinking is minimized.
        generationConfig: {
          thinkingConfig: { thinkingLevel: 'minimal' },
          maxOutputTokens: 1024,
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    if (data?.promptFeedback?.blockReason) {
      return null;
    }

    const translated = data?.candidates?.[0]?.content?.parts?.[0]?.text;

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
 * translation entirely). Tries Gemini 3.5 Flash first (accurate on Mongolian
 * cultural/clothing terms — see module comment above), falls back to
 * MyMemory, and falls back to the original text if both fail. Never throws —
 * a translation hiccup never blocks a generation.
 */
export async function translateMongolianToEnglish(text: string): Promise<string> {
  if (!containsCyrillic(text)) {
    return text;
  }

  const geminiResult = await geminiTranslateMongolianToEnglish(text);
  if (geminiResult) {
    return geminiResult;
  }

  const translated = await myMemoryTranslate(text, 'mn|en');
  return translated ?? text;
}

/**
 * Translates `text` from English to Mongolian. Used by the prompt enhancer
 * (src/libs/PromptEnhance.ts) to give the user a readable, editable
 * Mongolian preview of the enhancer's English-language description — see
 * that module for why the enhancement itself is generated in English rather
 * than Mongolian.
 *
 * Deliberately uses MyMemory only, NOT Gemini, even though Gemini is
 * used for the MN->EN direction above. Tried routing this direction through
 * Claude Haiku too (2026-07-09) and reverted the same day: a real user
 * report showed it producing incoherent Mongolian word-salad for longer,
 * flowery enhanced-prompt text (garbled grammar, invented/wrong words like
 * "нэхэмжлэгтэй" where "embroidered" was meant, nonsense repetition like
 * "сэвсгээр сэвсгүүлэн ухаалсан") — the same free-form-Mongolian-writing
 * failure mode PromptEnhance.ts's module comment already warns about for
 * generation, which apparently extends to translating longer/more elaborate
 * text into Mongolian too, not just short concrete terms. MyMemory's
 * translation reads stiffer but stays grammatical. Never throws — any
 * failure falls back to the original (English) text, so a translation
 * hiccup just means the preview box shows English instead of Mongolian
 * rather than breaking anything.
 *
 * MyMemory's free tier hard-caps the `q` query parameter at 500 characters
 * and returns an error STRING (not an HTTP error) if exceeded — see the
 * guard in myMemoryTranslate() above. PromptEnhance.ts's 2026-07-10 rewrite
 * (natural single-paragraph descriptions, no length cap) routinely produces
 * English text well past 500 characters, so long input is split into
 * sentence-boundary chunks under the limit, each translated separately, and
 * rejoined — this keeps the full-length English prompt intact for
 * generation while still giving the user a complete Mongolian preview,
 * instead of silently truncating or falling back to all-English.
 */
const MYMEMORY_CHUNK_MAX_CHARS = 450;

function splitIntoTranslatableChunks(text: string, maxChars: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length > 0 && (current.length + sentence.length) > maxChars) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim().length > 0) {
    chunks.push(current.trim());
  }

  return chunks;
}

export async function translateEnglishToMongolian(text: string): Promise<string> {
  if (text.length <= MYMEMORY_CHUNK_MAX_CHARS) {
    const translated = await myMemoryTranslate(text, 'en|mn');
    return translated ?? text;
  }

  const chunks = splitIntoTranslatableChunks(text, MYMEMORY_CHUNK_MAX_CHARS);
  const translatedChunks = await Promise.all(
    chunks.map(async chunk => (await myMemoryTranslate(chunk, 'en|mn')) ?? chunk),
  );
  return translatedChunks.join(' ');
}
