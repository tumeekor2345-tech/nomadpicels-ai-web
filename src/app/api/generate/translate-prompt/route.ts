import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { isPromptBlocked } from '@/libs/ContentModeration';
import { translateMongolianToEnglish } from '@/libs/Translate';

/**
 * Lightweight "just translate this" endpoint used by the prompt-enhancer's
 * editable Mongolian preview box (GenerateForm.tsx): every time the user
 * finishes editing that box (onBlur), the client calls this to refresh the
 * read-only English translation preview shown next to it. Deliberately does
 * NOT call Claude again — re-running the full enhancer on every edit would
 * be slow, costly, and would keep re-elaborating text the user is trying to
 * tighten up. Plain translation only, via src/libs/Translate.ts.
 */
export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body.text !== 'string' || !body.text.trim()) {
    return NextResponse.json({ error: 'text is required.' }, { status: 400 });
  }

  const translated = await translateMongolianToEnglish(body.text);

  if (isPromptBlocked(translated)) {
    return NextResponse.json(
      { error: 'prompt_blocked', message: 'This prompt violates our content policy.' },
      { status: 400 },
    );
  }

  return NextResponse.json({ translated });
}
