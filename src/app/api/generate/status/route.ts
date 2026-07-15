import type { GenerationKind } from '@/libs/RunPod';
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/libs/DB';
import { isFalJobId } from '@/libs/Fal';
import { getRunPodJobStatus, getRunPodPublicJobStatus, isRunPodPublicJobId } from '@/libs/RunPod';
import { generationSchema } from '@/models/Schema';

const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT']);

/**
 * Maps our app-level `generation.kind` (flux/wan/photo_restore/face_swap)
 * to the RunPod endpoint it actually runs on — photo_restore shares the
 * Flux endpoint (same worker, different workflow graph), so it isn't its
 * own RunPod GenerationKind.
 */
function toRunPodKind(dbKind: string): GenerationKind {
  if (dbKind === 'wan') {
    return 'wan';
  }
  if (dbKind === 'face_swap') {
    return 'faceswap';
  }
  return 'flux'; // 'flux' and 'photo_restore'
}

/**
 * Polls the status of a job previously started via POST /api/generate.
 * Usage: GET /api/generate/status?kind=flux|wan|photo_restore|face_swap&jobId=...
 */
export async function GET(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');

  if (!jobId) {
    return NextResponse.json({ error: 'jobId is required.' }, { status: 400 });
  }

  // Confirm this job belongs to the requesting user before returning
  // anything — jobId alone shouldn't be enough to read someone else's job.
  const [row] = await db
    .select()
    .from(generationSchema)
    .where(eq(generationSchema.jobId, jobId))
    .limit(1);

  if (!row || row.ownerId !== userId) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  try {
    // Three possible job id shapes now:
    // - `fal::{modelId}::{requestId}` — fal.ai jobs. fal.ai was fully retired
    //   2026-07-14 (see src/libs/RunPod.ts). 2026-07-15 fix: old pending rows
    //   with this shape were found still being polled every 4s, forever, on
    //   every page load (the client-side MAX_POLL_ATTEMPTS cap resets on
    //   every component remount, so it never actually stopped them) — with
    //   8 stale jobs accumulated from testing, this was enough concurrent
    //   fetch traffic to freeze the tab's renderer. Since fal.ai is gone for
    //   good, these jobs can never complete — resolve them as FAILED
    //   immediately (no outbound call, no more polling) instead of asking
    //   fal.ai's API at all.
    // - `rpub::{endpointId}::{requestId}` — RunPod Hub Public Endpoint jobs
    //   (Mid-tier Flux Dev, Top-tier Nano Banana 2, Wan video — see
    //   src/libs/RunPod.ts's "RunPod Hub Public Endpoints" section).
    // - anything else — the dedicated worker-comfyui/faceswap endpoints
    //   (Standard engine, Photo Restore, Image Effect).
    const status = isFalJobId(jobId)
      ? { id: jobId, status: 'FAILED' as const, error: 'fal.ai service was retired 2026-07-14; this job predates the switch to RunPod and can no longer complete.' }
      : isRunPodPublicJobId(jobId)
        ? await getRunPodPublicJobStatus(jobId)
        : await getRunPodJobStatus(toRunPodKind(row.kind), jobId);

    if (TERMINAL_STATUSES.has(status.status) && row.status !== status.status) {
      await db.update(generationSchema)
        .set({
          status: status.status,
          outputJson: status.output ? JSON.stringify(status.output) : null,
          errorMessage: status.error ?? null,
        })
        .where(eq(generationSchema.id, row.id));
    }

    return NextResponse.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
