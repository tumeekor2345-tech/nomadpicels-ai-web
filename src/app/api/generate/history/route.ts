import { auth } from '@clerk/nextjs/server';
import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/libs/DB';
import { generationSchema } from '@/models/Schema';

const HISTORY_LIMIT = 20;

/**
 * Lists the current user's past generations (newest first), for the
 * history/gallery section on the Create page.
 */
export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(generationSchema)
    .where(eq(generationSchema.ownerId, userId))
    .orderBy(desc(generationSchema.createdAt))
    .limit(HISTORY_LIMIT);

  const items = rows.map((row) => {
    let images: Array<{ filename: string; type: string; data: string }> | undefined;
    let videoUrl: string | undefined;
    let rawOutput: Record<string, unknown> | undefined;

    if (row.outputJson) {
      try {
        const parsed = JSON.parse(row.outputJson);
        if (Array.isArray(parsed?.images)) {
          images = parsed.images;
        } else if (typeof parsed?.result === 'string') {
          // Wan 2.2 (Hub endpoint) returns { cost, result: <video url> }.
          videoUrl = parsed.result;
        } else {
          rawOutput = parsed;
        }
      } catch {
        // ignore malformed stored JSON — shouldn't happen since we control writes
      }
    }

    return {
      id: row.id,
      kind: row.kind,
      prompt: row.prompt,
      status: row.status,
      images,
      videoUrl,
      rawOutput,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt,
    };
  });

  return NextResponse.json({ items });
}
