import { reinforceFullBodyFraming } from '@/libs/CompositionReinforcement';
import { reinforceEthnicity } from '@/libs/EthnicityReinforcement';
import { translateMongolianToEnglish } from '@/libs/Translate';

/**
 * Single entry point for turning a user's raw (Mongolian or English) prompt
 * into the exact English text sent to Flux/Wan. Added 2026-07-09 to replace
 * three separate, invisible server-side steps that were previously called
 * individually from src/app/api/generate/route.ts — after repeated live
 * debugging of the bust-crop framing issue, the user asked to see the actual
 * combined prompt and simplify the pipeline down to a small, fixed number of
 * stages instead of a sprawling chain.
 *
 * The whole pipeline is now exactly 4 stages, each independently understood:
 *
 *   1. TRANSLATE  — src/libs/Translate.ts: Mongolian -> English (Claude
 *      Haiku, falls back to MyMemory). No-op if the text has no Cyrillic.
 *   2. REINFORCE  — src/libs/EthnicityReinforcement.ts +
 *      src/libs/CompositionReinforcement.ts: adds the ethnicity anchor and,
 *      if full-body framing was requested, the framing anchor. Both keyed off
 *      the ORIGINAL (pre-translation) prompt so the Mongolian keyword checks
 *      still work.
 *   3. PREVIEW / EDIT — this function's result is what
 *      src/app/api/generate/preview-prompt/route.ts returns, which
 *      GenerateForm.tsx shows in an editable "Эцсийн Prompt" box. If the user
 *      edits it, the edited text is sent back as `finalPromptOverride` and
 *      src/app/api/generate/route.ts uses it AS-IS, skipping stages 1-2
 *      entirely for that generation.
 *   4. SEND TO RUNPOD — src/libs/RunPod.ts's buildFluxInput/buildWanInput
 *      patch this final string into the ComfyUI workflow / Wan request and
 *      submitRunPodJob() dispatches it.
 */
export async function buildFinalModelPrompt(originalPrompt: string): Promise<string> {
  const translated = await translateMongolianToEnglish(originalPrompt);
  const withEthnicity = reinforceEthnicity(originalPrompt, translated);
  const final = reinforceFullBodyFraming(originalPrompt, withEthnicity);
  return final;
}
