import type { EnhanceEngineId } from '@/libs/PromptEnhance';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { isPromptBlocked } from '@/libs/ContentModeration';
import { buildFinalModelPrompt } from '@/libs/PromptPipeline';

/**
 * Runs the full prompt pipeline (see src/libs/PromptPipeline.ts) and returns
 * the exact English text that would be sent to Flux/Wan — WITHOUT submitting
 * a generation job. This route is currently UNUSED by the client
 * (GenerateForm.tsx dropped the "Эцсийн Prompt" preview box on 2026-07-16 in
 * favor of a fully invisible/automatic pipeline) but is kept in place rather
 * than deleted, in case a preview UI is wanted again later. Since this route
 * has no reference-image/fluxEngine context like src/app/api/generate/route.ts
 * does, it can only guess a representative engine per kind rather than the
 * exact one that would actually run — good enough for a rough preview, not
 * used for a real generation.
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

  // No fluxEngine/reference-image context is available here (unlike
  // src/app/api/generate/route.ts), so this can only guess a representative
  // engine per kind — 'flux_schnell' (the Standard/default AI Image engine)
  // and 'wan_i2v' (the only Video engine) — rather than the exact engine a
  // real generation would resolve to.
  const engineId: EnhanceEngineId = body.kind === 'wan' ? 'wan_i2v' : 'flux_schnell';

  if (isPromptBlocked(body.prompt)) {
    return NextResponse.json(
      { error: 'prompt_blocked', message: 'This prompt violates our content policy.' },
      { status: 400 },
    );
  }

  const pipelineResult = await buildFinalModelPrompt(body.prompt, engineId);

  if (!pipelineResult.ok) {
    return NextResponse.json(
      { error: 'prompt_blocked', message: 'This prompt violates our content policy.' },
      { status: 400 },
    );
  }

  const finalPrompt = pipelineResult.prompt;

  if (finalPrompt !== body.prompt && isPromptBlocked(finalPrompt)) {
    return NextResponse.json(
      { error: 'prompt_blocked', message: 'This prompt violates our content policy.' },
      { status: 400 },
    );
  }

  return NextResponse.json({ finalPrompt });
}
