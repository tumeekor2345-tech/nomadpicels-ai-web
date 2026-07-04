import type { GenerationKind } from '@/libs/RunPod';
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/libs/DB';
import { getRunPodJobStatus } from '@/libs/RunPod';
import { generationSchema } from '@/models/Schema';

const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT']);

/**
 * Polls the status of a job previously started via POST /api/generate.
 * Usage: GET /api/generate/status?kind=flux|wan&jobId=...
 */
export async function GET(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get('kind') as GenerationKind | null;
  const jobId = searchParams.get('jobId');

  if (kind !== 'flux' && kind !== 'wan') {
    return NextResponse.json({ error: 'kind must be "flux" or "wan".' }, { status: 400 });
  }
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
    const status = await getRunPodJobStatus(kind, jobId);

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
