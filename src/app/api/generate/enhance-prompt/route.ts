import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { isPromptBlocked } from '@/libs/ContentModeration';
import { enhancePrompt } from '@/libs/PromptEnhance';

/**
 * User-initiated "Санаагаа сайжруул" (Improve my idea) preview — expands a
 * short/vague prompt into a detailed one via Claude Haiku (see
 * src/libs/PromptEnhance.ts). The client shows the result to the user and
 * only uses it if they explicitly approve it; nothing here submits a
 * generation job.
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

  const kind = body.kind === 'wan' ? 'wan' : 'flux';

  if (isPromptBlocked(body.prompt)) {
    return NextResponse.json(
      { error: 'prompt_blocked', message: 'This prompt violates our content policy.' },
      { status: 400 },
    );
  }

  const result = await enhancePrompt(body.prompt, kind);

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
  if (isPromptBlocked(result.enhancedPrompt)) {
    return NextResponse.json(
      { error: 'prompt_blocked', message: 'This prompt violates our content policy.' },
      { status: 400 },
    );
  }

  return NextResponse.json({ enhancedPrompt: result.enhancedPrompt });
}
