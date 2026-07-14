import { auth } from '@clerk/nextjs/server';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@/libs/DB';
import { tempUploadSchema } from '@/models/Schema';

// Some RunPod workers need to fetch a real HTTPS image URL (not an embedded
// base64 data: URI) — e.g. the Face Swap tool's comfyui-faceswap-sdxl
// endpoint sits behind a WAF that blocks requests carrying a large embedded
// data: URI (observed 2026-07-15: "[BLOCKED: Cookie/query string data]").
// This route lets the client upload a photo once, store it, and get back a
// short-lived URL on our own domain (GET /api/uploads/[token]) that any
// external worker can fetch like a normal public image.
const MAX_BYTES = 8 * 1024 * 1024; // 8MB — plenty for a phone photo
const ALLOWED_CONTENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { dataUrl?: unknown } | null;
  const dataUrl = body?.dataUrl;

  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return NextResponse.json({ error: 'dataUrl (a data: URI) is required.' }, { status: 400 });
  }

  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);

  if (!match) {
    return NextResponse.json({ error: 'dataUrl must be a base64-encoded data: URI.' }, { status: 400 });
  }

  const [, contentType, base64Data] = match;

  if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) {
    return NextResponse.json({ error: 'Unsupported image type.' }, { status: 400 });
  }

  // Rough size check without fully decoding — base64 is ~4/3 the byte size.
  if (!base64Data || base64Data.length > (MAX_BYTES * 4) / 3) {
    return NextResponse.json({ error: 'Image is too large (max 8MB).' }, { status: 413 });
  }

  const token = randomUUID();

  await db.insert(tempUploadSchema).values({
    token,
    ownerId: userId,
    contentType,
    data: base64Data,
  });

  const url = new URL(`/api/uploads/${token}`, request.url).toString();

  return NextResponse.json({ url });
}
