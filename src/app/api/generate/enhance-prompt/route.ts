import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { isPromptBlocked } from '@/libs/ContentModeration';
import { enhancePrompt } from '@/libs/PromptEnhance';
import { translateMongolianToEnglish } from '@/libs/Translate';

/**
 * User-initiated "Санаагаа сайжруул" (Improve my idea) preview — expands a
 * short/vague prompt into a detailed Mongolian description via Claude Haiku
 * (see src/libs/PromptEnhance.ts), plus an English translation preview of
 * that same text (see src/libs/Translate.ts) so the user can see roughly
 * what will actually reach Flux/Wan. The client shows both — the Mongolian
 * text is editable, the English translation is read-only — and only uses
 * the (possibly edited) Mongolian text if the user explicitly approves it.
 * Nothing here submits a generation job.
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

  // Translate immediately so the UI can show a "ready to use" English
  // preview alongside the editable Mongolian text.
  const englishPreview = await translateMongolianToEnglish(result.enhancedPrompt);

  // Belt-and-suspenders: also check whatever Claude produced (and its
  // translation), in case the model's own refusal instruction didn't
  // trigger for some edge case. isPromptBlocked() is English-only, so the
  // translated text is the one that actually matters here.
  if (isPromptBlocked(result.enhancedPrompt) || isPromptBlocked(englishPreview)) {
    return NextResponse.json(
      { error: 'prompt_blocked', message: 'This prompt violates our content policy.' },
      { status: 400 },
    );
  }

  return NextResponse.json({ enhancedPrompt: result.enhancedPrompt, englishPreview });
}
