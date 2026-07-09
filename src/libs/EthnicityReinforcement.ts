/**
 * Diffusion models — including Flux schnell, which this app runs on — are
 * documented to default toward generic, Western-leaning faces when a prompt
 * doesn't strongly anchor ethnicity (see e.g. arxiv.org/pdf/2506.13780,
 * "Hidden Bias in the Machine: Stereotypes in Text-to-Image Models", and
 * widespread community reports of the same behavior on Flux specifically).
 * A single mention of "Mongolian" buried inside a longer translated prompt —
 * especially after style/lens fragments get appended (see
 * src/libs/ImagePresets.ts) — often isn't enough to overcome that bias, and
 * schnell's few sampling steps make it follow prompts less precisely than
 * larger models to begin with.
 *
 * Fix: when the user's original Mongolian prompt mentions a person AND
 * mentions Mongolian ethnicity/nationality, front-load an explicit English
 * ethnicity + facial-feature anchor at the very start of the prompt sent to
 * the generation model. First-token position gets the most attention weight
 * from the text encoder, and repeating a concept (even if "Mongolian"
 * already appears later in the translated text) is a standard diffusion
 * prompt-engineering technique for increasing adherence — it's not a bug to
 * say it twice.
 *
 * This is a deterministic keyword check, not an LLM call — cheap, instant,
 * and doesn't depend on the (optional, user-triggered) Prompt Enhancer, so it
 * protects every generation, not just ones where the user clicked "Санаагаа
 * сайжруул".
 */

// Matches "монгол" as a stem — also catches "монголчууд", "монгол хүн",
// "монголын", etc. Intentionally broad; false positives (e.g. a prompt about
// "Монгол улс"'s flag with no person in it) are harmless since PERSON_TRIGGER
// below still has to match too.
const ETHNICITY_TRIGGER = /монгол/i;

// Common Mongolian words for "a person" / specific people, broad enough to
// catch the typical AI Image subjects (portraits, family scenes, workers,
// etc.) without being an exhaustive dictionary.
const PERSON_WORDS = [
  'хүн',
  'эрэгтэй',
  'эмэгтэй',
  'залуу',
  'өвгөн',
  'эмгэн',
  'хүүхэд',
  'бүсгүй',
  'хос',
  'найз',
  'ах',
  'эгч',
  'дүү',
  'аав',
  'ээж',
  'өвөө',
  'эмээ',
  'малчин',
  'хатагтай',
  'ноён',
  'багш',
  'оюутан',
  'инженер',
  'эмч',
  'жолооч',
];

const PERSON_TRIGGER = new RegExp(PERSON_WORDS.join('|'), 'i');

const ETHNICITY_ANCHOR = 'Mongolian ethnicity, East Asian facial features';

/**
 * If the user's original (Mongolian) prompt mentions both a person and
 * Mongolian ethnicity/nationality, prepends an explicit anchor phrase to the
 * already-translated English prompt before it's sent to Flux/Wan. Safe
 * no-op (returns `translatedPrompt` unchanged) otherwise.
 */
export function reinforceEthnicity(originalPrompt: string, translatedPrompt: string): string {
  if (!ETHNICITY_TRIGGER.test(originalPrompt) || !PERSON_TRIGGER.test(originalPrompt)) {
    return translatedPrompt;
  }

  return `${ETHNICITY_ANCHOR}, ${translatedPrompt}`;
}
