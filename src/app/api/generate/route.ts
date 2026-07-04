import type { ComfyUIWorkflow } from '@/libs/RunPod';
import fs from 'node:fs';
import path from 'node:path';
import { auth } from '@clerk/nextjs/server';
import { and, eq, gte, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { isPromptBlocked } from '@/libs/ContentModeration';
import { db } from '@/libs/DB';
import {
  buildFluxInput,
  buildWanInput,
  submitRunPodJob,
} from '@/libs/RunPod';
import { generationSchema } from '@/models/Schema';

/**
 * Starts a generation job (Flux image or Wan 2.2 video) and returns the
 * RunPod job id immediately. The client polls GET /api/generate/status for
 * status, since video generation can take well over typical serverless HTTP
 * timeouts.
 */

const FLUX_WORKFLOW_PATH = path.join(
  process.cwd(),
  'src/libs/workflows/flux-schnell-txt2img.json',
);

// Anti-abuse stopgap until real credit/subscription billing (QPay) is wired
// up. Not tied to the pricing page's per-plan limits yet — just a blunt cap
// so one account can't burn through the whole RunPod balance in a loop.
const DAILY_GENERATION_LIMIT = 20;

function loadFluxWorkflow(): ComfyUIWorkflow | null {
  if (!fs.existsSync(FLUX_WORKFLOW_PATH)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(FLUX_WORKFLOW_PATH, 'utf-8'));
}

async function countGenerationsToday(ownerId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(generationSchema)
    .where(and(
      eq(generationSchema.ownerId, ownerId),
      gte(generationSchema.createdAt, startOfDay),
    ));

  return Number(rows[0]?.count ?? 0);
}

export async function POST(request: Request) {
  const { userId, orgId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  if (!body || (body.kind !== 'flux' && body.kind !== 'wan')) {
    return NextResponse.json(
      { error: 'Request body must include kind: "flux" | "wan".' },
      { status: 400 },
    );
  }

  if (!body.prompt || typeof body.prompt !== 'string') {
    return NextResponse.json({ error: 'prompt is required.' }, { status: 400 });
  }

  if (isPromptBlocked(body.prompt)) {
    return NextResponse.json(
      { error: 'prompt_blocked', message: 'This prompt violates our content policy.' },
      { status: 400 },
    );
  }

  const usedToday = await countGenerationsToday(userId);
  if (usedToday >= DAILY_GENERATION_LIMIT) {
    return NextResponse.json(
      {
        error: 'daily_limit_reached',
        message: `You've reached today's limit of ${DAILY_GENERATION_LIMIT} generations. Please try again tomorrow.`,
      },
      { status: 429 },
    );
  }

  try {
    if (body.kind === 'flux') {
      const workflow = loadFluxWorkflow();

      if (!workflow) {
        return NextResponse.json(
          {
            error: 'flux_workflow_not_configured',
            message: 'Flux workflow.json is not set up yet. Export it from ComfyUI '
              + '(Workflow > Export (API)) and save it as '
              + 'src/libs/workflows/flux-schnell-txt2img.json — see that folder\'s '
              + 'README.md for the exact steps.',
          },
          { status: 501 },
        );
      }

      const input = buildFluxInput(workflow, {
        prompt: body.prompt,
        width: body.width,
        height: body.height,
        seed: body.seed,
      });

      const job = await submitRunPodJob('flux', input);

      const [row] = await db.insert(generationSchema).values({
        ownerId: userId,
        orgId: orgId ?? null,
        kind: 'flux',
        prompt: body.prompt,
        jobId: job.id,
        status: job.status,
      }).returning({ id: generationSchema.id });

      return NextResponse.json({ kind: 'flux', jobId: job.id, status: job.status, generationId: row?.id });
    }

    // kind === 'wan'
    if (!body.imageUrl || typeof body.imageUrl !== 'string') {
      return NextResponse.json(
        { error: 'imageUrl is required (Wan 2.2 is image-to-video).' },
        { status: 400 },
      );
    }

    const input = buildWanInput({
      prompt: body.prompt,
      imageUrl: body.imageUrl,
      negativePrompt: body.negativePrompt,
      durationSeconds: body.durationSeconds,
      size: body.size,
      seed: body.seed,
    });

    const job = await submitRunPodJob('wan', input);

    const [row] = await db.insert(generationSchema).values({
      ownerId: userId,
      orgId: orgId ?? null,
      kind: 'wan',
      prompt: body.prompt,
      jobId: job.id,
      status: job.status,
    }).returning({ id: generationSchema.id });

    return NextResponse.json({ kind: 'wan', jobId: job.id, status: job.status, generationId: row?.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
