import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { isPromptBlocked } from '@/libs/ContentModeration';
import { enhancePrompt } from '@/libs/PromptEnhance';
import { translateEnglishToMongolian } from '@/libs/Translate';

/**
 * User-initiated "Санаагаа сайжруул" (Improve my idea) preview — expands a
 * short/vague prompt into a detailed ENGLISH description via Claude Haiku
 * (see src/libs/PromptEnhance.ts for why English, not Mongolian, is
 * generated). That English text is translated to Mongolian (see
 * src/libs/Translate.ts) purely so the user has something readable to
 * review and edit. The client shows both — the Mongolian text is editable,
 * the English text is read-only — and only uses the (possibly edited)
 * Mongolian text if the user explicitly approves it. Nothing here submits a
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
