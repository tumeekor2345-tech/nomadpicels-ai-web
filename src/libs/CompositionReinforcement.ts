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
 *
 * Fix, round 3 (2026-07-10): composition itself was fine after round 2 (full
 * body, feet/legs visible, live-confirmed), but SUBJECT IDENTITY got worse —
 * live tests asking for "Mongolian woman wearing a deel" started coming back
 * with generic/wrong clothing (a headscarf-and-village look once, an
 * unrelated colorful dress another time), no deel in sight. Root cause is
 * the exact same front-token-dominance mechanism round 2 itself was built
 * on: FULL_BODY_FRONT_CUE was being prepended as the literal first tokens of
 * the prompt, ahead of the subject/identity description — so composition won
 * the same way the ethnicity anchor used to win before it was moved/removed.
 * Also suspected: FULL_BODY_END_ANCHOR's "small figure within a large scene,
 * distant full-length photograph" phrasing explicitly asks for a small,
 * distant subject, which works against rendering fine subject detail (like
 * an actual deel's diagonal closure and sash) clearly.
 *
 * Round 3 changes: (a) drop the front cue entirely — the subject/identity
 * description (modelPrompt) now always leads the prompt, unmodified; (b)
 * drop "small figure within a large scene, distant full-length photograph"
 * from the end anchor, keeping only the concrete-body-part instructions;
 * (c) add a separate, targeted garment reinforcement — when the user's
 * original prompt mentions a deel, append an explicit description of what a
 * deel actually looks like near the end, the same end-of-prompt position
 * that's proven to carry real weight without the front-position risk.
 */

// Matches common Mongolian phrasings for "full body" plus the English
// equivalents (in case the Prompt Enhancer or a bilingual user already wrote
// it in English). Intentionally broad — a false-positive match just adds a
// harmless framing fragment to a prompt that likely already wanted wider
// framing anyway.
const FULL_BODY_TRIGGER = /бүтэн\s*би|толгойгоос\s*хөл|бүх\s*бие|орой\s*дов\s*хүртэл|зогсож\s*байгаа|дүрс\s*бүрэн|full[\s-]?body|head\s*to\s*toe|whole\s*body/i;

const FULL_BODY_END_ANCHOR = '(full body shot:1.4), (wide shot, entire person visible from head to toe:1.3), feet and shoes visible, legs fully visible, standing at full height';

// Matches "дээл" (deel, the traditional Mongolian robe) in Mongolian or its
// already-translated English form. Separate from EthnicityReinforcement.ts
// (which is unused/blanket ethnicity anchoring, removed 2026-07-09) — this
// is narrowly about rendering the specific garment correctly when the user
// actually asked for one, not about steering ethnicity generally.
const DEEL_TRIGGER = /дээл|deel/i;

const DEEL_END_ANCHOR = '(wearing an authentic traditional Mongolian deel:1.3), a long robe with a diagonal front closure fastened at the shoulder and side, a wide fabric sash belt tied at the waist, standing collar';

/**
 * If the user's original prompt asked for full-body/wide framing and/or
 * mentioned a deel, appends explicit reinforcement to the END of the
 * already-translated model prompt — the subject/identity description
 * (modelPrompt) always stays first, unmodified. Safe no-op if neither
 * trigger matches.
 */
export function reinforceFullBodyFraming(originalPrompt: string, modelPrompt: string): string {
  const parts = [modelPrompt];

  if (FULL_BODY_TRIGGER.test(originalPrompt)) {
    parts.push(FULL_BODY_END_ANCHOR);
  }

  if (DEEL_TRIGGER.test(originalPrompt)) {
    parts.push(DEEL_END_ANCHOR);
  }

  return parts.join(', ');
}
