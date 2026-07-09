import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { isPromptBlocked } from '@/libs/ContentModeration';
import { buildFinalModelPrompt } from '@/libs/PromptPipeline';

/**
 * Runs the full 4-stage prompt pipeline (see src/libs/PromptPipeline.ts) and
 * returns the exact English text that would be sent to Flux/Wan — WITHOUT
 * submitting a generation job. Used by GenerateForm.tsx's "Эцсийн Prompt" box
 * so the user can see (and edit) what actually reaches the model, added
 * 2026-07-09 after several rounds of invisible server-side prompt
 * reinforcement made the bust-crop framing bug hard to reason about from the
 * outside.
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

  if (isPromptBlocked(body.prompt)) {
    return NextResponse.json(
      { error: 'prompt_blocked', message: 'This prompt violates our content policy.' },
      { status: 400 },
    );
  }

  const finalPrompt = await buildFinalModelPrompt(body.prompt);

  if (finalPrompt !== body.prompt && isPromptBlocked(finalPrompt)) {
    return NextResponse.json(
      { error: 'prompt_blocked', message: 'This prompt violates our content policy.' },
      { status: 400 },
    );
  }

  return NextResponse.json({ finalPrompt });
}
