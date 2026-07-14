import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/libs/DB';
import { tempUploadSchema } from '@/models/Schema';

// Serves an image previously stored via POST /api/uploads. Intentionally no
// auth check here — the whole point is that an external worker (RunPod)
// needs to fetch this over plain HTTPS with no cookies/headers of ours. The
// random UUID token is the only protection, same trade-off as any anonymous
// file-hosting link.
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;

  const [row] = await db
    .select()
    .from(tempUploadSchema)
    .where(eq(tempUploadSchema.token, token))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const bytes = Buffer.from(row.data, 'base64');

  return new NextResponse(bytes, {
    headers: {
      'Content-Type': row.contentType,
      'Cache-Control': 'public, max-age=3600, immutable',
    },
  });
}
