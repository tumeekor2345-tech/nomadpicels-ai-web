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
 * Fix, round 1 (kept): don't remove the ethnicity anchor (it's still
 * needed — see that module's own comment on why), but fight back by ALSO
 * appending an explicit framing instruction at the very END of the prompt
 * when the user actually asked for full-body/wide framing. End-of-prompt
 * position carries real weight in T5/CLIP encoding too, so restating the
 * instruction there is a standard diffusion prompt-engineering counter-move,
 * not a hack.
 *
 * Fix, round 2 (2026-07-09, same day): round 1 alone still wasn't enough —
 * live-tested again after also softening EthnicityReinforcement.ts's anchor
 * (dropped "facial"), and the result was wider but still not a true
 * head-to-toe shot. Strengthened further: (a) also PREPEND a short framing
 * cue at the very front, since front-token position is clearly the strongest
 * lever here (that's exactly why the ethnicity anchor was winning before);
 * (b) use ComfyUI's `(text:weight)` emphasis syntax, which CLIPTextEncode
 * supports for both the CLIP-L and T5-XXL encoders Flux uses — untested
 * whether schnell's guidance-free BasicGuider respects it as strongly as a
 * CFG-based model would, but it's a low-risk, standard technique worth
 * stacking on; (c) name concrete body parts (feet, shoes, legs) instead of
 * only the abstract phrase "full body" — diffusion models are generally more
 * reliable at rendering toward concrete nameable objects than abstract
 * framing concepts.
 */

// Matches common Mongolian phrasings for "full body" plus the English
// equivalents (in case the Prompt Enhancer or a bilingual user already wrote
// it in English). Intentionally broad — a false-positive match just adds a
// harmless framing fragment to a prompt that likely already wanted wider
// framing anyway.
const FULL_BODY_TRIGGER = /бүтэн\s*би|толгойгоос\s*хөл|бүх\s*бие|орой\s*дов\s*хүртэл|зогсож\s*байгаа|дүрс\s*бүрэн|full[\s-]?body|head\s*to\s*toe|whole\s*body/i;

const FULL_BODY_FRONT_CUE = '(full-body photograph:1.4)';

const FULL_BODY_END_ANCHOR = '(full body shot:1.4), (wide shot, entire person visible from head to toe:1.3), feet and shoes visible, legs fully visible, standing at full height, small figure within a large scene, distant full-length photograph';

/**
 * If the user's original prompt asked for full-body/wide framing, wraps the
 * already-translated, ethnicity-reinforced model prompt with an explicit
 * framing cue at the front AND a more detailed one at the end. Safe no-op
 * otherwise. Order in src/app/api/generate/route.ts: call this AFTER
 * reinforceEthnicity(), not before — it wraps whatever reinforceEthnicity()
 * already produced.
 */
export function reinforceFullBodyFraming(originalPrompt: string, modelPrompt: string): string {
  if (!FULL_BODY_TRIGGER.test(originalPrompt)) {
    return modelPrompt;
  }

  return `${FULL_BODY_FRONT_CUE}, ${modelPrompt}, ${FULL_BODY_END_ANCHOR}`;
}
