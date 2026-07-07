import type { ComfyUIWorkflow } from '@/libs/RunPod';
import fs from 'node:fs';
import path from 'node:path';
import { auth } from '@clerk/nextjs/server';
import { and, eq, gte, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { isPromptBlocked } from '@/libs/ContentModeration';
import { db } from '@/libs/DB';
import { CREDIT_COST } from '@/libs/Pricing';
import {
  buildFaceSwapInput,
  buildFluxImg2ImgInput,
  buildFluxInput,
  buildWanInput,
  submitRunPodJob,
} from '@/libs/RunPod';
import { creditBalanceSchema, generationSchema } from '@/models/Schema';

/**
 * Starts a generation job (Flux image, Wan 2.2 video, or a one-click "Tools"
 * job — photo restore / face swap) and returns the RunPod job id
 * immediately. The client polls GET /api/generate/status for status, since
 * video generation can take well over typical serverless HTTP timeouts.
 */

const FLUX_WORKFLOW_PATH = path.join(
  process.cwd(),
  'src/libs/workflows/flux-schnell-txt2img.json',
);

const FLUX_IMG2IMG_WORKFLOW_PATH = path.join(
  process.cwd(),
  'src/libs/workflows/flux-schnell-img2img.json',
);

// Preset prompts for the one-click "Tools" — the whole point is the user
// never has to type a prompt, so these are fixed server-side.
const PHOTO_RESTORE_PROMPT = 'restore and enhance this old photograph: remove scratches and noise, correct faded colors, sharpen details, keep the original composition and people unchanged';
const FACE_SWAP_PROMPT = 'a natural professional portrait photo, studio lighting, high detail, realistic';

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

function loadFluxImg2ImgWorkflow(): ComfyUIWorkflow | null {
  if (!fs.existsSync(FLUX_IMG2IMG_WORKFLOW_PATH)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(FLUX_IMG2IMG_WORKFLOW_PATH, 'utf-8'));
}

/** Fetches an image URL server-side and returns it as base64 (no external
 * hosting needed — worker-comfyui accepts base64 images in its `images`
 * array and loads them into ComfyUI's input folder before running). */
async function fetchImageAsBase64(imageUrl: string): Promise<string> {
  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`Could not fetch imageUrl (${res.status}).`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return buffer.toString('base64');
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

/**
 * Atomically tries to spend `cost` credits for `ownerId`. The
 * `balance >= cost` guard lives in the SQL WHERE clause (not a separate
 * select-then-update), so two concurrent requests can't both succeed against
 * the same last few credits — Postgres serializes the row update. Returns
 * true if the deduction succeeded.
 */
async function trySpendCredits(ownerId: string, cost: number): Promise<boolean> {
  const updated = await db
    .update(creditBalanceSchema)
    .set({ balance: sql`${creditBalanceSchema.balance} - ${cost}` })
    .where(and(eq(creditBalanceSchema.ownerId, ownerId), gte(creditBalanceSchema.balance, cost)))
    .returning({ balance: creditBalanceSchema.balance });

  return updated.length > 0;
}

/** Refunds credits after a paid generation failed to submit to RunPod. */
async function refundCredits(ownerId: string, cost: number): Promise<void> {
  await db
    .update(creditBalanceSchema)
    .set({ balance: sql`${creditBalanceSchema.balance} + ${cost}` })
    .where(eq(creditBalanceSchema.ownerId, ownerId));
}

export async function POST(request: Request) {
  const { userId, orgId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const VALID_KINDS = ['flux', 'wan', 'photo_restore', 'face_swap'];

  if (!body || !VALID_KINDS.includes(body.kind)) {
    return NextResponse.json(
      { error: `Request body must include kind: ${VALID_KINDS.map(k => `"${k}"`).join(' | ')}.` },
      { status: 400 },
    );
  }

  // "Tools" (photo_restore, face_swap) are one-click — the server fills in a
  // fixed prompt, the user never types one. flux/wan still require a prompt.
  const needsUserPrompt = body.kind === 'flux' || body.kind === 'wan';
  if (needsUserPrompt && (!body.prompt || typeof body.prompt !== 'string')) {
    return NextResponse.json({ error: 'prompt is required.' }, { status: 400 });
  }

  if (needsUserPrompt && isPromptBlocked(body.prompt)) {
    return NextResponse.json(
      { error: 'prompt_blocked', message: 'This prompt violates our content policy.' },
      { status: 400 },
    );
  }

  const needsImageUrl = body.kind === 'wan' || body.kind === 'photo_restore' || body.kind === 'face_swap';
  if (needsImageUrl && (!body.imageUrl || typeof body.imageUrl !== 'string')) {
    return NextResponse.json(
      { error: 'imageUrl is required.' },
      { status: 400 },
    );
  }

  const fluxWorkflow = body.kind === 'flux' ? loadFluxWorkflow() : null;
  if (body.kind === 'flux' && !fluxWorkflow) {
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

  const img2imgWorkflow = body.kind === 'photo_restore' ? loadFluxImg2ImgWorkflow() : null;
  if (body.kind === 'photo_restore' && !img2imgWorkflow) {
    return NextResponse.json(
      {
        error: 'img2img_workflow_not_configured',
        message: 'src/libs/workflows/flux-schnell-img2img.json is missing.',
      },
      { status: 501 },
    );
  }

  // Paying users: spend credits and skip the free daily cap entirely.
  // Free users (no credits, or insufficient balance): fall back to the
  // existing anti-abuse daily limit.
  const creditCost = CREDIT_COST[body.kind as keyof typeof CREDIT_COST];
  const paidWithCredits = await trySpendCredits(userId, creditCost);

  if (!paidWithCredits) {
    const usedToday = await countGenerationsToday(userId);
    if (usedToday >= DAILY_GENERATION_LIMIT) {
      return NextResponse.json(
        {
          error: 'daily_limit_reached',
          message: `You've reached today's limit of ${DAILY_GENERATION_LIMIT} generations, and you don't have enough credits. Buy a credit package on the Billing page to generate more.`,
        },
        { status: 429 },
      );
    }
  }

  try {
    if (body.kind === 'flux') {
      const input = buildFluxInput(fluxWorkflow!, {
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

    if (body.kind === 'wan') {
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
    }

    if (body.kind === 'photo_restore') {
      const imageBase64 = await fetchImageAsBase64(body.imageUrl);
      const input = buildFluxImg2ImgInput(img2imgWorkflow!, {
        prompt: PHOTO_RESTORE_PROMPT,
        imageBase64,
        denoise: body.denoise,
      });

      // Runs on the same RunPod endpoint as regular Flux — only the
      // workflow graph sent in the request differs.
      const job = await submitRunPodJob('flux', input);

      const [row] = await db.insert(generationSchema).values({
        ownerId: userId,
        orgId: orgId ?? null,
        kind: 'photo_restore',
        prompt: PHOTO_RESTORE_PROMPT,
        jobId: job.id,
        status: job.status,
      }).returning({ id: generationSchema.id });

      return NextResponse.json({ kind: 'photo_restore', jobId: job.id, status: job.status, generationId: row?.id });
    }

    // kind === 'face_swap'
    const input = buildFaceSwapInput({
      prompt: FACE_SWAP_PROMPT,
      imageUrl: body.imageUrl,
    });

    const job = await submitRunPodJob('faceswap', input);

    const [row] = await db.insert(generationSchema).values({
      ownerId: userId,
      orgId: orgId ?? null,
      kind: 'face_swap',
      prompt: FACE_SWAP_PROMPT,
      jobId: job.id,
      status: job.status,
    }).returning({ id: generationSchema.id });

    return NextResponse.json({ kind: 'face_swap', jobId: job.id, status: job.status, generationId: row?.id });
  } catch (error) {
    // The job never made it to RunPod — refund any credits we spent above,
    // since the user got nothing for them. Free-tier requests (paidWithCredits
    // === false) already only cost a daily-limit slot, not credits.
    if (paidWithCredits) {
      await refundCredits(userId, creditCost);
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
