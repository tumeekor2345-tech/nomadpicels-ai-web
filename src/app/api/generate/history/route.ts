import { auth } from '@clerk/nextjs/server';
import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/libs/DB';
import { generationSchema } from '@/models/Schema';

const HISTORY_LIMIT = 20;
const VALID_KINDS = new Set(['flux', 'wan', 'photo_restore', 'face_swap', 'image_effect']);

/**
 * Lists the current user's past generations (newest first), for the
 * history/gallery section on the Create page and on each Tools workspace
 * page. Optional `?kind=` filters to a single generation kind (e.g. the
 * Face Swap page only wants `face_swap` rows in its history sidebar).
 */
export async function GET(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const kindParam = searchParams.get('kind');
  const kind = kindParam && VALID_KINDS.has(kindParam) ? kindParam : null;

  const rows = await db
    .select()
    .from(generationSchema)
    .where(
      kind
        ? and(eq(generationSchema.ownerId, userId), eq(generationSchema.kind, kind))
        : eq(generationSchema.ownerId, userId),
    )
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
        } else if (typeof parsed?.image_base64 === 'string') {
          // Face Swap (comfyui-faceswap-sdxl) returns { image_base64: "..." }.
          images = [{ filename: `${row.kind}-${row.id}.png`, type: 'base64', data: parsed.image_base64 }];
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
      jobId: row.jobId,
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
