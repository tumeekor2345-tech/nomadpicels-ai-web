import { Buffer } from 'node:buffer';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { isAdminUser } from '@/libs/Admin';
import { FACE_SWAP_STYLE_PROMPTS, isFaceSwapStyleId } from '@/libs/FaceSwapStyles';
import { extractFaceSwapImage, pollRunPodJob, submitRunPodJob } from '@/libs/RunPod';

export const maxDuration = 120;

// Admin-only utility: (re)generates the static preview thumbnail shown on a
// Face Swap style card, by calling the faceswap worker in "text only" mode
// (no image_url — see comfyui-faceswap-sdxl README). This is NOT part of the
// user-facing product; it's how we produced the images under
// /public/face-swap-styles/*.jpg. Safe to keep since it's gated by
// isAdminUser and only ever generates from the fixed, moderated
// FACE_SWAP_STYLE_PROMPTS map, never client-supplied text.
export async function GET(request: Request) {
  const { userId } = await auth();

  if (!(await isAdminUser(userId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const style = searchParams.get('style');

  if (!isFaceSwapStyleId(style)) {
    return NextResponse.json({ error: 'invalid style' }, { status: 400 });
  }

  const input = {
    prompt: FACE_SWAP_STYLE_PROMPTS[style],
    negative_prompt: 'bad quality, blurry, deformed, nudity, nsfw, shirtless, bare chest, bare shoulders, low-cut clothing, revealing clothing',
    width: 640,
    height: 832,
    steps: 30,
    cfg: 2.0,
    output: { include_base64: true, save_to_volume: false },
  };

  try {
    const job = await submitRunPodJob('faceswap', input);
    const finalStatus = await pollRunPodJob('faceswap', job.id, { intervalMs: 3000, timeoutMs: 110_000 });

    if (finalStatus.status !== 'COMPLETED') {
      return NextResponse.json(
        { error: 'generation_failed', status: finalStatus.status, detail: finalStatus.output ?? finalStatus.error },
        { status: 502 },
      );
    }

    const base64 = extractFaceSwapImage(finalStatus);
    if (!base64) {
      return NextResponse.json({ error: 'no_image_in_output' }, { status: 502 });
    }

    const buffer = Buffer.from(base64, 'base64');
    return new NextResponse(new Uint8Array(buffer), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
