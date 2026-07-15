/**
 * AI-assisted prompt enhancement for users who type a short or vague idea for
 * their AI Image/Video generation (e.g. "морь унасан хүн" instead of a full,
 * detailed prompt). Calls an LLM to expand the user's idea into a single,
 * detailed prompt — written in ENGLISH.
 *
 * Provider note (updated 2026-07-16): this ran on Claude Haiku (Anthropic
 * Messages API) from when the feature was first built through 2026-07-16.
 * Switched to Google Gemini 3.5 Flash at the user's explicit request, even
 * though Gemini 3.5 Flash is somewhat MORE expensive per call than Haiku
 * ($1.50/$9 vs $1/$5 per MTok — roughly $0.0024 vs $0.0015 per generation at
 * this module's token budget) — cost was not the deciding factor here. The
 * persona/rules in systemPromptFor() below (buzzword ban, cultural
 * construction detail, per-engine word budgets) are unchanged and
 * provider-agnostic; only the HTTP call in enhancePrompt() changed (Gemini's
 * generateContent REST API instead of Anthropic's Messages API — different
 * endpoint, auth header, and request/response JSON shape).
 *
 * Why English and not Mongolian: an earlier version asked the model to write
 * the enhanced description directly in Mongolian, since that's what the user
 * needs to read/edit. In practice Claude Haiku's free-form Mongolian writing
 * was unreliable — it produced incoherent, word-salad text often enough to
 * be a real problem (reported by a live user: nonsense phrases like
 * "эвэртэй туулай" showing up in otherwise unrelated descriptions). English
 * writing is strong on both providers, and English is also what Flux/Wan
 * actually consume. So this module always produces English, and the route
 * handler (src/app/api/generate/enhance-prompt/route.ts) translates that
 * English text to Mongolian via src/libs/Translate.ts's
 * translateEnglishToMongolian() purely for display/editing — translation is
 * a much more constrained task than free creative writing and doesn't
 * exhibit the same failure mode.
 *
 * That route (and the Mongolian-preview UI it fed) is no longer used by the
 * client — see src/libs/PromptPipeline.ts's module comment: as of 2026-07-16
 * this enhancement runs fully automatically/invisibly on every generation,
 * not via a user-approved preview step.
 *
 * Requires GEMINI_API_KEY to be set (Vercel project env vars, or
 * .env.local for local dev). Get a key at https://aistudio.google.com/apikey.
 * If the key is missing, enhancePrompt() returns { ok: false, reason:
 * 'not_configured' } rather than throwing, so the rest of the app keeps
 * working — src/libs/PromptPipeline.ts falls back to plain translation in
 * that case.
 */

const GEMINI_MODEL = 'gemini-3.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
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
 *
 * Length cap added 2026-07-16: since this became fully automatic (see
 * src/libs/PromptPipeline.ts — no more manual "Санаагаа сайжруул" preview
 * the user could shorten by hand), the "expand across a dozen categories"
 * rule was producing quite long paragraphs. User asked to rein this in —
 * picked "Дунд — 2-3 өгүүлбэр (~60-80 үг)" from the given options — so rule
 * 3 below now explicitly caps length and says to touch only the categories
 * that matter for this particular idea, not exhaustively hit every one.
 *
 * Buzzword rule strengthened same day after a live test (AI Image, style =
 * Photorealistic, prompt "монгол гэр") showed Claude ADDING buzzwords rather
 * than avoiding them — output included "cinematic composition, ultra
 * photorealistic, documentary photography, National Geographic style, 85mm
 * lens, shallow depth of field, HDR, natural colors, masterpiece,
 * award-winning photography, 8k, ultra detailed, realistic lighting, sharp
 * focus, high dynamic range" despite rule 1 already banning this. Root
 * cause: the client (GenerateForm.tsx's buildFinalPrompt()) appends the
 * selected Style/Lens preset's own short tag fragment (e.g. "photorealistic,
 * ultra detailed, realistic lighting" — see src/libs/ImagePresets.ts's
 * STYLE_PRESETS) onto the user's idea BEFORE it ever reaches this module, so
 * Claude was handed buzzwords as if they were part of the "user's" request
 * and, under the old rule 3 ("stay faithful to what the user asked for"),
 * treated them as something to honor and build on instead of strip. Rule 1
 * now explicitly lists the exact phrases that leaked through as banned
 * examples and tells Claude to strip/ignore any such tags already present in
 * the input rather than extend them. Also added `temperature: 0.3` to the
 * API call below (previously unset, i.e. Anthropic's default ~1.0) to make
 * rule-following more literal and consistent run to run.
 *
 * Rule 4 (cultural accuracy) strengthened same day after a side-by-side live
 * comparison: same idea ("Mongolian wrestlers"), same engine (Nano Banana
 * 2), our site vs imagine.art — imagine.art correctly rendered an
 * open-chested zodog vest + shuudag briefs, ours rendered a full-coverage
 * red/blue outfit that isn't real zodog/shuudag at all. Just naming "zodog/
 * shuudag" wasn't enough — the IMAGE model (not Claude) doesn't reliably
 * know what those words look like, the same failure class as the earlier
 * "дээл" MyMemory mistranslation bug (see src/libs/Translate.ts), just at
 * the image-generation stage instead of translation. Fix: rule 4 now spells
 * out the actual visual construction (open front, bare chest/belly, long
 * sleeves attached at the shoulder only, tight brief shorts, knee-high
 * leather boots) instead of relying on the loanword alone, and generalizes
 * that pattern to other cultural garments/objects too.
 *
 * Per-engine word budget added 2026-07-15 (later date stamp than the notes
 * above, kept in original order): the ~60-80 word cap was tuned specifically
 * around Flux SCHNELL's few-step distilled sampler — that's the engine the
 * 2026-07-10 composition bug was diagnosed on, and it's genuinely starved by
 * long/dense prompts. It was applied uniformly to every engine even though
 * the app actually dispatches to several structurally different backends
 * (see src/libs/RunPod.ts): Flux Dev (more sampling steps, tolerates more
 * detail), Nano Banana 2 (Gemini-based — strong natural-language
 * understanding, not a few-step diffusion sampler, and specifically the
 * engine the zodog/shuudag cultural-accuracy bug was found on, so it
 * benefits from MORE room to spell out construction detail, not less), Qwen
 * Image and Wan T2I (diffusion-based like Flux, similar sensitivity).
 * `enhancePrompt()` now takes a specific `EnhanceEngineId` instead of the
 * old flux/wan `kind`, and `systemPromptFor()` picks a word budget per
 * engine from ENGINE_PROFILES below instead of one fixed number. Rule 1
 * (buzzword ban), rule 2 (concrete light/mood), rule 4 (cultural
 * construction detail), and rule 5 (flowing prose) stay identical across all
 * engines — only the length budget and the image/video framing note vary.
 *
 * Rule 4 narrowed-to-wrestlers bug found 2026-07-15 (first live test after
 * the Gemini 3.5 Flash switch, engine = Qwen Image): prompt was just "Монгол
 * наадам" (Mongolian Naadam, the whole festival — no sport named), but the
 * output rendered ONLY two wrestlers grappling, no crowd/banners/stadium, no
 * sense of a festival at all. Root cause: rule 4's own wording — "For
 * Mongolian wrestling (Bökh) at Naadam specifically" plus "even if that means
 * spending most of your sentence/word budget on it" — was the only concrete
 * Mongolian example anywhere in the system prompt, so the model latched onto
 * "wrestling" the instant "Naadam" appeared and spent the entire word budget
 * on zodog/shuudag construction detail, leaving no room for any of the
 * broader festival context the user actually asked for. Fix: rule 4 now
 * distinguishes a close-up on a specific garment (still gets full
 * construction detail) from a bare EVENT NAME like "Naadam" (which means the
 * эрийн гурван наадам — wrestling + archery + horse racing — and should
 * default to describing the wider festive scene: crowd, banners/flag,
 * stadium or steppe, nearby ger camp) so a generic Naadam prompt isn't
 * silently narrowed to two figures with no context.
 *
 * thinkingConfig fix added 2026-07-16 (same day, later): after the Naadam
 * rule-4 fix above, a live test still produced wildly inconsistent/unrelated
 * images across repeated identical "Монгол наадам" generations. Root cause,
 * confirmed via Vercel logs + Gemini docs: gemini-3.5-flash "thinks"
 * internally by default (thinkingLevel "medium"), and thinking tokens are
 * drawn from the SAME maxOutputTokens budget as the visible answer. With
 * maxOutputTokens at 320 and no thinkingConfig, internal reasoning silently
 * consumed nearly the whole budget, hard-truncating the actual answer
 * mid-sentence (logged output: "Under a vast blue sky on the sweeping green
 * Mongolian steppe, a" — cut off before any subject was named). Downstream
 * image engines then had to hallucinate the missing subject each time,
 * producing different unrelated results per generation. Fixed in
 * enhancePrompt() below by setting thinkingConfig.thinkingLevel to 'minimal'
 * and raising maxOutputTokens to 1024 as headroom.
 *
 * Persona reconciled with a user-supplied "world's best AI Image Prompt
 * Engineer" template 2026-07-16 (same day, later still). That template
 * covered many more backends (FLUX Pro, GPT Image, Imagen 4, SDXL, Midjourney,
 * Ideogram) than this platform actually uses, and — critically — directly
 * contradicted two already-fixed, live-tested bugs above: it told the model
 * to actively USE buzzwords/camera-gear brand names ("cinematic",
 * "award-winning photography", "ARRI Alexa", "Kodak Portra", "HDR", etc. —
 * exactly what rule 1 bans) and to always emit a separate "Negative Prompt:"
 * block, which this module's caller (enhancePrompt() below) does not parse —
 * it takes the whole response as one literal prompt string, so a labeled
 * "Main Prompt: / Negative Prompt:" format would land in Flux/Wan as visible
 * text. Asked the user how to proceed (AskUserQuestion); they chose
 * "Зохицуулж нэгтгэх" — keep the buzzword ban, per-engine length budget, and
 * single-string output intact, but fold in the template's genuinely useful,
 * COMPATIBLE ideas: an explicit silent visual-thinking checklist before
 * writing (rule 0 below), a broader named category list to draw from (already
 * present in rule 3, left as-is), a realism rule translating "no artificial
 * HDR look / believable anatomy" into concrete non-buzzword language (new
 * rule 6), and a composition rule (new rule 7). No separate negative prompt
 * output was added — the module comment above already explains why that
 * belongs in the RunPod/Fal input builders, not here, and that reasoning is
 * unchanged.
 */
type EnhanceEngineId = 'flux_schnell' | 'flux_dev' | 'nanobanana2' | 'qwen_image' | 'wan_t2i' | 'wan_i2v';

const ENGINE_PROFILES: Record<EnhanceEngineId, { sentences: string; words: string; isVideo: boolean }> = {
  // Flux Schnell (RunPod public + dedicated-pod img2img): distilled few-step
  // sampler, gets starved/confused by dense prompts — keep this the
  // shortest, most concrete budget (unchanged from the original 2026-07-16 cap).
  flux_schnell: { sentences: '2-3', words: '60-80', isVideo: false },
  // Flux Dev: same family, more sampling steps — can absorb a bit more
  // concrete detail without losing composition.
  flux_dev: { sentences: '2-4', words: '80-110', isVideo: false },
  // Nano Banana 2 (Gemini-based Edit endpoint): not a few-step diffusion
  // sampler, has strong natural-language understanding, and is the engine
  // the zodog/shuudag cultural-accuracy bug was diagnosed on — give it the
  // most room specifically so rule 4's construction detail isn't squeezed out.
  nanobanana2: { sentences: '3-5', words: '100-150', isVideo: false },
  // Qwen Image (Alibaba, diffusion-based like Flux): keep concise.
  qwen_image: { sentences: '2-3', words: '60-90', isVideo: false },
  // Wan T2I (Alibaba, diffusion-based still-image mode): keep concise.
  wan_t2i: { sentences: '2-3', words: '60-90', isVideo: false },
  // Wan I2V (RunPod "wan-2-2-i2v-720"): same concise budget, but framed as
  // video — see mediumNote below.
  wan_i2v: { sentences: '2-3', words: '60-90', isVideo: true },
};

function systemPromptFor(engineId: EnhanceEngineId): string {
  const profile = ENGINE_PROFILES[engineId];
  const mediumNote = profile.isVideo
    ? 'This description is for a text-to-VIDEO model: weave in a simple, concrete description of what moves or happens in the scene as part of the same paragraph — not a separate tag.'
    : 'This description is for a text-to-IMAGE model: describe a single still moment, not action unfolding over time.';

  return [
    'You are Bold, the world\'s best AI Image Prompt Engineer, working for a Mongolian AI image/video generation platform that uses Nano Banana 2, Flux, Qwen Image, and Wan.',
    'Your job is NOT to translate literally. Users type short, vague ideas — often just one or two words, in Mongolian or English. Infer the most likely visual scene and expand it into a concise, vivid description written as natural, fluent English prose — the way a person would describe a photograph aloud in a couple of sentences, not a list of tags or keywords. Avoid randomness — every word you choose should improve the image, never pad the sentence.',
    'Never write a story or biography, never explain your reasoning, and only describe what should visibly appear in the image.',
    'If the user writes in Mongolian, think in Mongolian first, then produce the result ONLY in English — never output Mongolian.',
    '0. Before writing, silently work out (do not show this in your output): what is the true subject, what single thing makes this scene visually striking, what light and setting best support the mood, and — if a specific culture, garment, or named event is involved — what it actually, authentically looks like. Then write only the concise final description reflecting those decisions.',
    'Follow these rules strictly:',
    '1. Never use generic technical quality buzzwords, camera-spec shorthand, or camera/film-stock brand names — banned examples include (but are not limited to) "8k", "photorealistic", "ultra photorealistic", "ultra detailed", "highly detailed", "cinematic lighting", "cinematic composition", "masterpiece", "award-winning photography", "documentary photography", "National Geographic style", "HDR", "high dynamic range", "sharp focus", "natural colors", "trending on artstation", "ARRI Alexa", "RED V-Raptor", "Kodak Portra", "Sony A1", "Canon EOS R5", "IMAX cinematic frame", or any similar stock phrase or gear name — these models respond poorly to keyword-stuffing like this; describe the scene concretely instead. This rule applies even if the input idea you were given already contains such tags (for example a trailing comma-separated fragment like "photorealistic, ultra detailed, realistic lighting" appended by a style preset) — treat those as noise to ignore, strip them out, and never extend or add more of them; expand only the actual subject/scene idea in concrete language.',
    '2. Instead of naming a lighting, mood, or lens/camera keyword, describe concretely what the light and framing actually look like (for example, instead of "cinematic lighting, 85mm lens" write something like "warm late-afternoon sunlight slants low across the field, casting long amber shadows, the subject filling most of the frame") — but only if this is one of the few details you have room for; see the length limit below.',
    `3. Keep the WHOLE result to about ${profile.sentences} sentences, roughly ${profile.words} words total — this is a concise, punchy prompt, not an exhaustive scene description. Pick only the most important details for this particular idea (e.g. subject + pose/expression + setting + one telling detail of light or clothing) from the fuller list of subject, appearance, pose, expression, clothing, environment, background, time of day, weather, lighting, camera angle, lens, depth of field, composition, materials, textures, color palette, and atmosphere — do not try to touch all of them. Stay faithful to what the user actually asked for; add sensible, concrete detail without inventing details that contradict or wildly diverge from their idea.`,
    '4. Always preserve authentic culture — respect real history, architecture, clothing, facial features, and landscapes; never mix cultures together and never westernize a traditional subject. But a loanword alone is not enough, because the IMAGE model rendering your description often does not know what a culture-specific garment or event actually looks like (only you, writing the description, do). When a specific traditional garment IS the close subject of the scene, spell out its real visual construction — cut, coverage, silhouette, material — instead of just naming it. For Mongolian wrestling (Bökh): describe an open-fronted zodog — a small, tight vest with long sleeves attached only at the shoulders that leaves the chest and belly bare — paired with tight brief-style shuudag shorts and knee-high leather gutul boots; never a full-coverage shirt, jacket, or generic deel robe. For any other Mongolian scene, keep the setting authentic too — real Mongolian horse breeds (sturdy, short-legged steppe horses, not thoroughbreds), real white felt gers with a wooden lattice frame, and the low, sparse grass and wide open steppe rather than lush foreign countryside. But a broad or vague idea that just names an EVENT — like "Naadam" or "Монгол наадам" without specifying wrestling, archery, or horse racing — means the whole festival: the эрийн гурван наадам (three manly games), held with a large cheering crowd, colorful banners and the Mongolian flag, an open stadium or steppe arena, and often a cluster of white ger tents nearby. For a bare event name like that, describe the wide festive scene and its recognizable atmosphere (crowd, banners, setting) rather than jumping straight to two isolated figures with no context — you can still feature one of the three sports (e.g. wrestlers in zodog/shuudag) as the focal activity, but do not let clothing construction detail crowd out the atmosphere that makes it recognizably a festival rather than an empty gym. Apply the same reasoning to any other culture\'s clothing, objects, or named events: describe what it actually looks like and, for broad event names, include enough setting/atmosphere to be recognizable as that event, never a generic or context-free substitute.',
    '5. Write the entire result as flowing prose sentences — never sections, numbering, markdown, or a comma-separated list of fragments.',
    '6. When the scene calls for realism, favor believable anatomy and natural proportions, natural (not plastic-smooth) skin texture, shadows that fall consistently with the described light source, and natural color grading — describe these qualities in plain concrete language rather than naming them (never write "realistic", "natural skin texture", or "accurate lighting" as a label; just describe what is actually visible).',
    '7. Keep the composition visually balanced with the subject clearly the focal point — mention a second layer (something in the foreground or background) only when it genuinely helps the scene read better, and never let the description become cluttered with too many competing details.',
    mediumNote,
    'Do not write biographies, do not explain history, do not describe invisible internal emotions, and do not repeat the same information twice.',
    `If the request describes sexual content involving minors, non-consensual sexual content, or other clearly disallowed content, respond with exactly the single word ${REFUSAL_MARKER} and nothing else.`,
    `Respond with ONLY the finished English prompt (${profile.sentences} sentences, ~${profile.words} words) — no preamble, no greeting, no labels, no "Main Prompt:"/"Negative Prompt:" sections, no quotation marks, no explanation.`,
  ].join(' ');
}

export type { EnhanceEngineId };

export type EnhanceResult
  = | { ok: true; enhancedPrompt: string }
    | { ok: false; reason: 'blocked' | 'not_configured' | 'failed' };

/**
 * Expands `rawPrompt` into a detailed English description via Gemini 3.5
 * Flash, tailored to the specific downstream image/video engine (see
 * `EnhanceEngineId` / `ENGINE_PROFILES` above for why the word budget
 * differs per engine). Never throws — any failure (missing key, timeout,
 * network error, malformed response, or Gemini's own safety block) is
 * reported as a typed failure reason instead.
 */
export async function enhancePrompt(rawPrompt: string, engineId: EnhanceEngineId): Promise<EnhanceResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ENHANCE_TIMEOUT_MS);

    const res = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Gemini's REST API accepts the key either as a query param
        // (?key=...) or this header — the header keeps it out of logs/URLs.
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPromptFor(engineId) }] },
        contents: [{ role: 'user', parts: [{ text: rawPrompt }] }],
        generationConfig: {
          // Lower than Gemini's default so rule-following (the buzzword ban
          // especially) is more literal and consistent — carried over from
          // the same reasoning applied to the Claude Haiku call this
          // replaced 2026-07-16, see module comment.
          temperature: 0.3,
          // thinkingConfig added 2026-07-16 (same day, found via live
          // "монгол наадам" debugging): Gemini 3.x models think by default
          // (thinkingLevel "medium" for gemini-3.5-flash) and thinking tokens
          // are drawn from the SAME maxOutputTokens budget as the visible
          // answer. With maxOutputTokens at 320 and no thinkingConfig, nearly
          // the entire budget was silently consumed by internal reasoning,
          // hard-truncating the actual answer mid-sentence (confirmed via
          // Vercel logs: output cut off at "...a" with no subject named).
          // This task — expanding a short idea into a prompt — needs no
          // multi-step reasoning, so thinking is set to 'minimal' (Gemini
          // doesn't allow fully disabling thinking on 3.5 Flash the way
          // thinkingBudget=0 did on 2.5 Flash).
          thinkingConfig: { thinkingLevel: 'minimal' },
          // Raised from 320 as extra headroom now that thinking is minimized
          // — the widest per-engine budget is nanobanana2's ~150 words
          // (~200-220 tokens); 1024 gives a large safety margin even if
          // 'minimal' still reasons a bit on a harder prompt (per Gemini's
          // docs, minimal does not guarantee thinking is fully off).
          maxOutputTokens: 1024,
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { ok: false, reason: 'failed' };
    }

    const data = await res.json();

    // Gemini can block at the PROMPT level (promptFeedback.blockReason, no
    // candidates at all) or at the RESPONSE level (a candidate exists but
    // finishReason is SAFETY/RECITATION/etc. instead of STOP, sometimes with
    // no text parts). Treat both as a moderation block rather than a generic
    // failure, same as REFUSAL_MARKER below for the model's own refusal.
    if (data?.promptFeedback?.blockReason) {
      return { ok: false, reason: 'blocked' };
    }

    const candidate = data?.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;

    if (typeof text !== 'string' || text.trim().length === 0) {
      return candidate?.finishReason && candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS'
        ? { ok: false, reason: 'blocked' }
        : { ok: false, reason: 'failed' };
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
