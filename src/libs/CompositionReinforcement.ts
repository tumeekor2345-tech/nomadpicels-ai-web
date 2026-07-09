/**
 * Companion to EthnicityReinforcement.ts, added 2026-07-09 after live-testing
 * showed the bust/headshot-only crop problem was NOT fully fixed by removing
 * the Mongolian LoRA (see src/libs/RunPod.ts's comment on why the LoRA was
 * removed). Test: prompt "Монгол дээлтэй эмэгтэйн бүтэн биеийн зураг" ("full
 * body photo of a woman in a Mongolian deel") at a 9:16 aspect ratio, LoRA
 * already removed, still came back as a tight face/shoulders crop.
 *
 * Root cause (traced through the actual pipeline in
 * src/app/api/generate/route.ts): EthnicityReinforcement.ts's
 * reinforceEthnicity() PREPENDS "Mongolian ethnicity, East Asian facial
 * features" to the very front of the model prompt. Those first few tokens —
 * especially the phrase "facial features" — plant a strong "frame the face
 * closely" signal before the model ever reaches the user's own "full body"
 * wording, which by then is buried later in the (translated, reinforced)
 * text. Flux schnell's 8-step distilled sampler follows early/salient
 * prompt tokens much more literally than it resolves competing instructions
 * spread across a long prompt, so the early anchor wins.
 *
 * Fix: don't remove the ethnicity anchor (it's still needed — see that
 * module's own comment on why), but fight back by ALSO appending an explicit
 * framing instruction at the very END of the prompt when the user actually
 * asked for full-body/wide framing. End-of-prompt position carries real
 * weight in T5/CLIP encoding too, so restating the instruction there is a
 * standard diffusion prompt-engineering counter-move, not a hack.
 */

// Matches common Mongolian phrasings for "full body" plus the English
// equivalents (in case the Prompt Enhancer or a bilingual user already wrote
// it in English). Intentionally broad — a false-positive match just adds a
// harmless framing fragment to a prompt that likely already wanted wider
// framing anyway.
const FULL_BODY_TRIGGER = /бүтэн\s*би|толгойгоос\s*хөл|бүх\s*бие|орой\s*дов\s*хүртэл|зогсож\s*байгаа|дүрс\s*бүрэн|full[\s-]?body|head\s*to\s*toe|whole\s*body/i;

const FULL_BODY_ANCHOR = 'full-body shot, entire figure visible from head to toe, wide framing, subject standing at a distance from the camera';

/**
 * If the user's original prompt asked for full-body/wide framing, appends an
 * explicit framing anchor to the end of the already-translated,
 * ethnicity-reinforced model prompt. Safe no-op otherwise. Order in
 * src/app/api/generate/route.ts: call this AFTER reinforceEthnicity(), not
 * before — it appends to whatever reinforceEthnicity() already produced.
 */
export function reinforceFullBodyFraming(originalPrompt: string, modelPrompt: string): string {
  if (!FULL_BODY_TRIGGER.test(originalPrompt)) {
    return modelPrompt;
  }

  return `${modelPrompt}, ${FULL_BODY_ANCHOR}`;
}
