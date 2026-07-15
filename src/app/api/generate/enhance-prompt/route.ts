import type { EnhanceEngineId } from '@/libs/PromptEnhance';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { isPromptBlocked } from '@/libs/ContentModeration';
import { enhancePrompt } from '@/libs/PromptEnhance';
import { translateEnglishToMongolian } from '@/libs/Translate';

/**
 * Formerly the user-initiated "Санаагаа сайжруул" (Improve my idea) preview.
 * That button/preview flow was removed from GenerateForm.tsx on 2026-07-16
 * (see src/libs/PromptPipeline.ts's module comment) in favor of a fully
 * automatic, invisible enhancement stage inside POST /api/generate — this
 * route is currently UNUSED by the client but kept working (not deleted) in
 * case a manual preview is wanted again later. No fluxEngine/reference-image
 * context is available here, so it can only guess a representative engine
 * per kind rather than the exact one a real generation would resolve to —
 * see src/app/api/generate/preview-prompt/route.ts for the same caveat.
 */
export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body.prompt !== 'string' || !body.prompt.trim()) {
    return NextResponse.json({ error: 'prompt is required.' }, { status: 400 });
  }

  const engineId: EnhanceEngineId = body.kind === 'wan' ? 'wan_i2v' : 'flux_schnell';

  if (isPromptBlocked(body.prompt)) {
    return NextResponse.json(
      { error: 'prompt_blocked', message: 'This prompt violates our content policy.' },
      { status: 400 },
    );
  }

  const result = await enhancePrompt(body.prompt, engineId);

  if (!result.ok) {
    if (result.reason === 'blocked') {
      return NextResponse.json(
        { error: 'prompt_blocked', message: 'This prompt violates our content policy.' },
        { status: 400 },
      );
    }

    if (result.reason === 'not_configured') {
      return NextResponse.json({ error: 'not_configured' }, { status: 501 });
    }

    return NextResponse.json({ error: 'enhance_failed' }, { status: 502 });
  }

  // Belt-and-suspenders: also check whatever Claude produced, in case the
  // model's own refusal instruction didn't trigger for some edge case.
  // isPromptBlocked() is English-only, and result.enhancedPrompt is already
  // English, so this check applies directly — no translation needed first.
  if (isPromptBlocked(result.enhancedPrompt)) {
    return NextResponse.json(
      { error: 'prompt_blocked', message: 'This prompt violates our content policy.' },
      { status: 400 },
    );
  }

  // Translate the (already good, coherent) English description to Mongolian
  // purely for the editable preview box — the English itself is what
  // actually reaches Flux/Wan once the user approves.
  const mongolianPreview = await translateEnglishToMongolian(result.enhancedPrompt);

  return NextResponse.json({ enhancedPrompt: mongolianPreview, englishPreview: result.enhancedPrompt });
}
