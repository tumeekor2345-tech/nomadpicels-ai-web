import { reinforceFullBodyFraming } from '@/libs/CompositionReinforcement';
import { enhancePrompt } from '@/libs/PromptEnhance';
import { translateMongolianToEnglish } from '@/libs/Translate';

/**
 * Single entry point for turning a user's raw (Mongolian or English) idea
 * into the exact English text sent to Flux/Wan.
 *
 * Revised 2026-07-16: previously this only translated + reinforced framing,
 * and a separate manual "Санаагаа сайжруул" button (GenerateForm.tsx) let the
 * user optionally run Claude Haiku's fuller PromptEnhance.ts expansion,
 * preview it, and approve it before it replaced their prompt. The user asked
 * to drop that manual step entirely: "энэ промт сайжируулалт гэж хэрэггүй
 * байна. хэрэглэгчийн өгсөн түлхүүр үгүүдийг ашиглан авто промтоо тааруулж
 * сайжируулдаг байхаар хийнэ" (don't need the separate enhance UI — just
 * auto-tune/expand the prompt from whatever keywords the user gave, at
 * generate time). So PromptEnhance.ts's expansion is now folded directly
 * into this pipeline as its own stage, always on, with no user click needed
 * — mirroring how src/libs/Translate.ts's automatic MN->EN translation
 * already worked invisibly at generation time before this change.
 *
 * The pipeline is now 3 stages, each independently understood:
 *
 *   1. ENHANCE — src/libs/PromptEnhance.ts: Claude Haiku expands the user's
 *      short/vague idea (Mongolian or English) into one detailed English
 *      description, following the Bold persona rules (no buzzwords, real
 *      cultural detail, single flowing paragraph). This already handles
 *      MN->EN translation as part of expanding, so it replaces the old
 *      standalone TRANSLATE stage in the common case. If Claude is
 *      unavailable/not configured, or fails, falls back to the old
 *      translate-only behavior (src/libs/Translate.ts) so generation never
 *      hard-fails just because enhancement did. If Claude explicitly refuses
 *      (disallowed content), that block is propagated up as
 *      `{ ok: false, reason: 'blocked' }` rather than silently falling back
 *      — silently falling back to the raw prompt here would bypass the
 *      semantic safety check.
 *   2. REINFORCE — src/libs/CompositionReinforcement.ts: if full-body
 *      framing was requested, adds the framing anchor, keyed off the
 *      ORIGINAL (pre-enhancement) prompt so the Mongolian keyword check
 *      still works.
 *   3. PREVIEW / EDIT — this function's result is what
 *      src/app/api/generate/preview-prompt/route.ts returns, which
 *      GenerateForm.tsx shows (auto-refreshing, debounced) in an editable
 *      "Эцсийн Prompt" box — this box is now the ONLY place the user sees/
 *      adjusts the enhanced prompt, no separate enhance-and-approve step. If
 *      the user edits it, the edited text is sent back as
 *      `finalPromptOverride` and src/app/api/generate/route.ts uses it
 *      AS-IS, skipping stages 1-2 entirely for that generation.
 *   4. SEND TO RUNPOD — src/libs/RunPod.ts's buildFluxInput/buildWanInput
 *      patch this final string into the ComfyUI workflow / Wan request and
 *      submitRunPodJob() dispatches it.
 */
export type FinalPromptResult
  = | { ok: true; prompt: string }
    | { ok: false; reason: 'blocked' };

export async function buildFinalModelPrompt(originalPrompt: string, kind: 'flux' | 'wan'): Promise<FinalPromptResult> {
  const enhanced = await enhancePrompt(originalPrompt, kind);

  if (enhanced.ok) {
    return { ok: true, prompt: reinforceFullBodyFraming(originalPrompt, enhanced.enhancedPrompt) };
  }

  if (enhanced.reason === 'blocked') {
    return { ok: false, reason: 'blocked' };
  }

  // 'not_configured' or 'failed' — ANTHROPIC_API_KEY missing, timeout, or
  // some other hiccup. Fall back to the older translate+reinforce pipeline
  // so generation still works.
  const translated = await translateMongolianToEnglish(originalPrompt);
  return { ok: true, prompt: reinforceFullBodyFraming(originalPrompt, translated) };
}
