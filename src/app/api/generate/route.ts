import type { ComfyUIWorkflow } from '@/libs/RunPod';
import fs from 'node:fs';
import path from 'node:path';
import { auth } from '@clerk/nextjs/server';
import { and, eq, gte, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import type { FluxEngineId } from '@/libs/Pricing';
import { isAdminUser } from '@/libs/Admin';
import { isPromptBlocked } from '@/libs/ContentModeration';
import { db } from '@/libs/DB';
import {
  buildFalFluxDevImg2ImgInput,
  buildFalFluxDevInput,
  buildFalNanoBanana2EditInput,
  buildFalNanoBanana2Input,
  buildFalWanInput,
  submitFalJob,
} from '@/libs/Fal';
import { DEFAULT_FACE_SWAP_STYLE, FACE_SWAP_STYLE_PROMPTS, isFaceSwapStyleId } from '@/libs/FaceSwapStyles';
import {
  buildImageEffectPrompt,
  CAMERA_ANGLE_PRESETS,
  COLOR_PALETTE_PRESETS,
  EFFECT_PRESETS,
  STYLE_PRESETS,
} from '@/libs/ImagePresets';
import { CREDIT_COST, FLUX_ENGINE_CREDIT_COST, wanCreditCost } from '@/libs/Pricing';
import { buildFinalModelPrompt } from '@/libs/PromptPipeline';
import {
  buildFaceSwapInput,
  buildFluxImg2ImgInput,
  buildFluxInput,
  submitRunPodJob,
} from '@/libs/RunPod';
import { creditBalanceSchema, generationSchema } from '@/models/Schema';

// "AI Image" tool engine selector, added 2026-07-13 — see src/libs/Pricing.ts
// (FLUX_ENGINE_CREDIT_COST) and src/libs/Fal.ts. Defaults to 'runpod' (the
// original self-hosted engine) so old clients that don't send `engine` keep
// working unchanged.
const VALID_FLUX_ENGINES: FluxEngineId[] = ['runpod', 'fal_flux_dev', 'fal_nanobanana2'];

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
// Face Swap "templates" live in src/libs/FaceSwapStyles.ts — the client only
// ever sends a style id, never a raw prompt, so every template goes through
// the same content-safety negative prompt below.
// Without an explicit clothing instruction the base SDXL model sometimes
// defaults to bare shoulders/chest — tested live on 2026-07-08 and confirmed.
// This negative prompt is what actually keeps every template's output modest.
const FACE_SWAP_NEGATIVE_PROMPT = 'bad quality, blurry, deformed, nudity, nsfw, shirtless, bare chest, bare shoulders, low-cut clothing, revealing clothing';

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

/**
 * Fetches an image URL server-side and returns it as base64 (no external
 * hosting needed — worker-comfyui accepts base64 images in its `images`
 * array and loads them into ComfyUI's input folder before running).
 */
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
  const VALID_KINDS = ['flux', 'wan', 'photo_restore', 'face_swap', 'image_effect'];

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

  // 4-stage prompt pipeline (see src/libs/PromptPipeline.ts for the full
  // breakdown: translate -> reinforce ethnicity/composition -> preview/edit
  // -> send to RunPod). Stage 3 is client-side: GenerateForm.tsx calls
  // POST /api/generate/preview-prompt to show the user the exact text stage
  // 1-2 would produce, and if the user edits that box, the edited text comes
  // back here as `finalPromptOverride` and is used AS-IS — stages 1-2 are
  // skipped entirely for that generation. Added 2026-07-09 after several
  // rounds of invisible reinforcement made the bust-crop framing bug hard to
  // debug from outside; the user asked to expose the real final prompt
  // rather than keep guessing at it blind.
  const hasOverride = needsUserPrompt
    && typeof body.finalPromptOverride === 'string'
    && body.finalPromptOverride.trim().length > 0;
  const modelPrompt = needsUserPrompt
    ? (hasOverride ? body.finalPromptOverride.trim() : await buildFinalModelPrompt(body.prompt))
    : body.prompt;

  if (needsUserPrompt && modelPrompt !== body.prompt && isPromptBlocked(modelPrompt)) {
    return NextResponse.json(
      { error: 'prompt_blocked', message: 'This prompt violates our content policy.' },
      { status: 400 },
    );
  }

  const needsImageUrl = body.kind === 'wan' || body.kind === 'photo_restore' || body.kind === 'face_swap' || body.kind === 'image_effect';
  if (needsImageUrl && (!body.imageUrl || typeof body.imageUrl !== 'string')) {
    return NextResponse.json(
      { error: 'imageUrl is required.' },
      { status: 400 },
    );
  }

  // The AI Image (Flux) generator's "add reference" feature reuses the same
  // img2img workflow as Photo Restore — composition/subject-guided
  // generation, not face-consistency (that would need IP-Adapter, which the
  // current RunPod worker doesn't bundle).
  const usingFluxReference = body.kind === 'flux'
    && typeof body.referenceImageBase64 === 'string'
    && body.referenceImageBase64.length > 0;

  const fluxEngine: FluxEngineId = body.kind === 'flux' && VALID_FLUX_ENGINES.includes(body.engine)
    ? body.engine
    : 'runpod';
  const usingRunPodFlux = body.kind === 'flux' && fluxEngine === 'runpod';

  // Fal-hosted engines (fal_flux_dev / fal_nanobanana2) don't use ComfyUI
  // workflow.json graphs at all — only the 'runpod' engine, and
  // photo_restore/image_effect (still RunPod-only for now — see Task #136),
  // need these loaded.
  const fluxWorkflow = (usingRunPodFlux && !usingFluxReference) ? loadFluxWorkflow() : null;
  if (usingRunPodFlux && !usingFluxReference && !fluxWorkflow) {
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

  const needsImg2ImgWorkflow = body.kind === 'photo_restore' || body.kind === 'image_effect' || (usingFluxReference && usingRunPodFlux);
  const img2imgWorkflow = needsImg2ImgWorkflow ? loadFluxImg2ImgWorkflow() : null;
  if (needsImg2ImgWorkflow && !img2imgWorkflow) {
    return NextResponse.json(
      {
        error: 'img2img_workflow_not_configured',
        message: 'src/libs/workflows/flux-schnell-img2img.json is missing.',
      },
      { status: 501 },
    );
  }

  // Admin users (see src/libs/Admin.ts) bypass both the credit cost and the
  // daily generation limit entirely — they never spend credits and are never
  // subject to DAILY_GENERATION_LIMIT.
  //
  // Paying users: spend credits and skip the free daily cap entirely.
  // Free users (no credits, or insufficient balance): fall back to the
  // existing anti-abuse daily limit.
  const isAdmin = await isAdminUser(userId);
  const creditCost = body.kind === 'flux'
    ? FLUX_ENGINE_CREDIT_COST[fluxEngine]
    : body.kind === 'wan'
      ? wanCreditCost(typeof body.durationSeconds === 'number' ? body.durationSeconds : 5)
      : CREDIT_COST[body.kind as keyof typeof CREDIT_COST];
  const paidWithCredits = isAdmin ? false : await trySpendCredits(userId, creditCost);

  if (!isAdmin && !paidWithCredits) {
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
      // 3-way engine selector (added 2026-07-13) — 'runpod' keeps the
      // original self-hosted path unchanged; 'fal_flux_dev' and
      // 'fal_nanobanana2' route to fal.ai instead (see src/libs/Fal.ts).
      // referenceImageBase64 arrives as bare base64 (no data: prefix — see
      // GenerateForm.tsx's handleReferenceFileChange), so fal's image_url
      // param needs a data: URI built here.
      const referenceDataUrl = usingFluxReference
        ? `data:image/png;base64,${body.referenceImageBase64}`
        : null;

      const job = fluxEngine === 'fal_flux_dev'
        ? await submitFalJob(
            referenceDataUrl ? 'fal-ai/flux/dev/image-to-image' : 'fal-ai/flux/dev',
            referenceDataUrl
              ? buildFalFluxDevImg2ImgInput({
                  prompt: modelPrompt,
                  imageBase64DataUrl: referenceDataUrl,
                  strength: typeof body.denoise === 'number' ? body.denoise : 0.55,
                  seed: body.seed,
                })
              : buildFalFluxDevInput({ prompt: modelPrompt, width: body.width, height: body.height, seed: body.seed }),
          )
        : fluxEngine === 'fal_nanobanana2'
          ? await submitFalJob(
              referenceDataUrl ? 'fal-ai/nano-banana-2/edit' : 'fal-ai/nano-banana-2',
              referenceDataUrl
                ? buildFalNanoBanana2EditInput({ prompt: modelPrompt, imageBase64DataUrl: referenceDataUrl })
                : buildFalNanoBanana2Input({ prompt: modelPrompt }),
            )
          : await submitRunPodJob(
              'flux',
              usingFluxReference
                ? buildFluxImg2ImgInput(img2imgWorkflow!, {
                    prompt: modelPrompt,
                    imageBase64: body.referenceImageBase64,
                    denoise: typeof body.denoise === 'number' ? body.denoise : 0.55,
                    seed: body.seed,
                  })
                : buildFluxInput(fluxWorkflow!, {
                    prompt: modelPrompt,
                    width: body.width,
                    height: body.height,
                    seed: body.seed,
                  }),
            );

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
      // Migrated 2026-07-13: Wan video now runs entirely on fal.ai's Wan 2.7
      // (fal-ai/wan/v2.7/image-to-video) — no engine choice here, unlike the
      // "AI Image" tool, since RunPod's Wan 2.2 endpoint is being retired.
      // See wanCreditCost() in src/libs/Pricing.ts for why the credit cost
      // scales with durationSeconds now instead of a flat 8.
      const input = buildFalWanInput({
        prompt: modelPrompt,
        imageUrl: body.imageUrl,
        negativePrompt: body.negativePrompt,
        durationSeconds: body.durationSeconds,
        size: body.size,
        seed: body.seed,
      });

      const job = await submitFalJob('fal-ai/wan/v2.7/image-to-video', input);

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

    if (body.kind === 'image_effect') {
      // "Prompt-free" like Photo Restore / Face Swap — the client only ever
      // sends preset ids (validated against the known preset lists below),
      // never raw prompt text, so isPromptBlocked() doesn't need to run here.
      const styleId = STYLE_PRESETS.some(s => s.id === body.styleId) ? body.styleId : 'none';
      const colorPaletteId = COLOR_PALETTE_PRESETS.some(p => p.id === body.colorPaletteId) ? body.colorPaletteId : 'none';
      const effectId = EFFECT_PRESETS.some(e => e.id === body.effectId) ? body.effectId : 'none';
      const cameraAngleId = CAMERA_ANGLE_PRESETS.some(a => a.id === body.cameraAngleId) ? body.cameraAngleId : 'none';
      const imageEffectPrompt = buildImageEffectPrompt({ styleId, colorPaletteId, effectId, cameraAngleId });

      const imageBase64 = await fetchImageAsBase64(body.imageUrl);
      const input = buildFluxImg2ImgInput(img2imgWorkflow!, {
        prompt: imageEffectPrompt,
        imageBase64,
        denoise: typeof body.denoise === 'number' ? body.denoise : 0.55,
      });

      // Runs on the same RunPod endpoint as regular Flux — only the
      // workflow graph sent in the request differs.
      const job = await submitRunPodJob('flux', input);

      const [row] = await db.insert(generationSchema).values({
        ownerId: userId,
        orgId: orgId ?? null,
        kind: 'image_effect',
        prompt: imageEffectPrompt,
        jobId: job.id,
        status: job.status,
      }).returning({ id: generationSchema.id });

      return NextResponse.json({ kind: 'image_effect', jobId: job.id, status: job.status, generationId: row?.id });
    }

    // kind === 'face_swap'
    // Style id comes from the client (a short id, e.g. "deel"), but the
    // actual prompt text is always resolved server-side from
    // FACE_SWAP_STYLE_PROMPTS — the client can never inject arbitrary
    // prompt text into this "prompt-free" tool.
    const requestedStyle: unknown = body.style;
    const faceSwapStyle = isFaceSwapStyleId(requestedStyle) ? requestedStyle : DEFAULT_FACE_SWAP_STYLE;
    const faceSwapPrompt = FACE_SWAP_STYLE_PROMPTS[faceSwapStyle];

    const input = buildFaceSwapInput({
      prompt: faceSwapPrompt,
      negativePrompt: FACE_SWAP_NEGATIVE_PROMPT,
      imageUrl: body.imageUrl,
    });

    const job = await submitRunPodJob('faceswap', input);

    const [row] = await db.insert(generationSchema).values({
      ownerId: userId,
      orgId: orgId ?? null,
      kind: 'face_swap',
      prompt: faceSwapPrompt,
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
