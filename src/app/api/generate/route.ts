import type { FluxEngineId } from '@/libs/Pricing';

import type { EnhanceEngineId } from '@/libs/PromptEnhance';
import type { ComfyUIWorkflow } from '@/libs/RunPod';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { auth } from '@clerk/nextjs/server';
import { and, eq, gte, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { isAdminUser } from '@/libs/Admin';
import { isPromptBlocked } from '@/libs/ContentModeration';
import { db } from '@/libs/DB';
import { DEFAULT_FACE_SWAP_STYLE, FACE_SWAP_STYLE_PROMPTS, isFaceSwapStyleId } from '@/libs/FaceSwapStyles';
import {
  buildImageEffectPrompt,
  CAMERA_ANGLE_PRESETS,
  COLOR_PALETTE_PRESETS,
  EFFECT_PRESETS,
  STYLE_PRESETS,
} from '@/libs/ImagePresets';
import { CREDIT_COST, FACE_SWAP_PRO_CREDIT_COST, FLUX_ENGINE_CREDIT_COST, wanCreditCost } from '@/libs/Pricing';
import { buildFinalModelPrompt } from '@/libs/PromptPipeline';
import {
  buildFaceSwapInput,
  buildFluxImg2ImgInput,
  buildNanoBanana2FaceSwapInput,
  buildQwenImageInput,
  buildRunPodFluxDevInput,
  buildRunPodFluxSchnellInput,
  buildWanInput,
  buildWanT2IInput,
  submitRunPodJob,
  submitRunPodPublicJob,
} from '@/libs/RunPod';
import { creditBalanceSchema, generationSchema } from '@/models/Schema';

// "AI Image" tool engine selector, added 2026-07-13, fully moved off fal.ai
// onto RunPod Hub's Public Endpoints 2026-07-14 — see src/libs/Pricing.ts
// (FLUX_ENGINE_CREDIT_COST) and src/libs/RunPod.ts's "RunPod Hub Public
// Endpoints" section. Defaults to 'runpod' (the original self-hosted
// engine) so old clients that don't send `engine` keep working unchanged.
// NOTE: the id 'fal_flux_dev' is kept as-is (not renamed to
// 'runpod_flux_dev') to avoid touching every file that references it
// (Pricing.ts, GenerateForm.tsx, translations, existing DB rows) — as of
// 2026-07-14 it calls RunPod's Public Endpoint, not fal.ai. 2026-07-15:
// 'fal_nanobanana2' (Nano Banana 2) was removed from this selector — see
// src/libs/Pricing.ts's FluxEngineId comment for why; the underlying
// endpoint is still used directly by Face Swap's swap mode below.
const VALID_FLUX_ENGINES: FluxEngineId[] = ['runpod', 'fal_flux_dev', 'qwen_image', 'wan_t2i'];

/**
 * Starts a generation job (Flux image, Wan 2.2 video, or a one-click "Tools"
 * job — photo restore / face swap) and returns the RunPod job id
 * immediately. The client polls GET /api/generate/status for status, since
 * video generation can take well over typical serverless HTTP timeouts.
 */

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

  // The AI Image (Flux) generator's "add reference" feature reuses the same
  // img2img workflow as Photo Restore — composition/subject-guided
  // generation, not face-consistency (that would need IP-Adapter, which the
  // current RunPod worker doesn't bundle).
  //
  // These are resolved up here (moved 2026-07-15, previously computed after
  // the prompt pipeline ran) because the prompt-enhance stage below now needs
  // to know the ACTUAL engine a generation will run on — see EnhanceEngineId
  // in src/libs/PromptEnhance.ts — not just the broad flux/wan kind.
  const usingFluxReference = body.kind === 'flux'
    && typeof body.referenceImageBase64 === 'string'
    && body.referenceImageBase64.length > 0;

  const fluxEngine: FluxEngineId = body.kind === 'flux' && VALID_FLUX_ENGINES.includes(body.engine)
    ? body.engine
    : 'runpod';
  const usingRunPodFlux = body.kind === 'flux' && fluxEngine === 'runpod';

  // Maps the resolved engine selection onto the specific id
  // src/libs/PromptEnhance.ts tailors its word budget/rules for (see
  // ENGINE_PROFILES there) — mirrors exactly which backend the dispatch
  // switch below actually calls for each combination.
  const enhanceEngineId: EnhanceEngineId = body.kind === 'wan'
    ? 'wan_i2v'
    : fluxEngine === 'runpod'
      ? 'flux_schnell'
      : fluxEngine === 'fal_flux_dev'
        ? 'flux_dev'
        : fluxEngine === 'qwen_image'
          ? 'qwen_image'
          : 'wan_t2i';

  // 3-stage prompt pipeline (see src/libs/PromptPipeline.ts for the full
  // breakdown: auto-enhance -> reinforce composition -> send to RunPod).
  // Stage 1 runs Gemini 3.5 Flash automatically on every generation (no manual
  // "Санаагаа сайжруул" step, per the user's 2026-07-16 request), tailored to
  // the specific `enhanceEngineId` resolved above (per the user's 2026-07-15
  // request to differentiate prompt style per engine rather than just
  // flux/wan). `finalPromptOverride` is legacy: GenerateForm.tsx no longer
  // sends it (the "Эцсийн Prompt" preview box was removed), but the override
  // path is kept working in case anything still sends it — used AS-IS,
  // skipping stage 1-2 entirely for that generation.
  const hasOverride = needsUserPrompt
    && typeof body.finalPromptOverride === 'string'
    && body.finalPromptOverride.trim().length > 0;

  let modelPrompt: string = body.prompt;
  if (needsUserPrompt && !hasOverride) {
    const pipelineResult = await buildFinalModelPrompt(body.prompt, enhanceEngineId);
    // TEMPORARY diagnostic logging (2026-07-15) — investigating a report of
    // wildly inconsistent/off-topic output for the same raw prompt ("монгол
    // наадам" producing an unrelated woman's portrait, a horse rider, and
    // isolated wrestlers across 3 separate generations). Remove once
    // diagnosed. Visible in Vercel's Function logs for this request.
    // eslint-disable-next-line no-console
    console.log('[prompt-debug]', JSON.stringify({
      engine: enhanceEngineId,
      raw: body.prompt,
      final: pipelineResult.ok ? pipelineResult.prompt : `BLOCKED:${pipelineResult.reason}`,
    }));
    if (!pipelineResult.ok) {
      return NextResponse.json(
        { error: 'prompt_blocked', message: 'This prompt violates our content policy.' },
        { status: 400 },
      );
    }
    modelPrompt = pipelineResult.prompt;
  } else if (hasOverride) {
    modelPrompt = body.finalPromptOverride.trim();
  }

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

  // Face Swap's "2 зураг" (swap) mode — added 2026-07-15, see
  // buildNanoBanana2FaceSwapInput() in src/libs/RunPod.ts for why this reuses
  // the Nano Banana 2 Edit Public Endpoint instead of a dedicated worker.
  // `body.imageUrl` above is the target/background photo in this mode;
  // `body.faceImageUrl` is the separate face-only reference.
  const usingFaceSwapSwapMode = body.kind === 'face_swap' && body.mode === 'swap';
  if (usingFaceSwapSwapMode && (!body.faceImageUrl || typeof body.faceImageUrl !== 'string')) {
    return NextResponse.json(
      { error: 'faceImageUrl is required in swap mode.' },
      { status: 400 },
    );
  }

  // RunPod Public Endpoint engines (fal_flux_dev, qwen_image, wan_t2i, and as
  // of 2026-07-15 also the plain 'runpod' Standard engine — see
  // buildRunPodFluxSchnellInput()'s comment in src/libs/RunPod.ts) don't use
  // ComfyUI workflow.json graphs at all. Only a Standard-engine request WITH
  // a reference image (img2img — the public Flux Schnell endpoint has no
  // img2img mode) still needs the dedicated worker-comfyui endpoint, same as
  // photo_restore/image_effect.
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
      : usingFaceSwapSwapMode
        ? FACE_SWAP_PRO_CREDIT_COST
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
      // Engine selector (added 2026-07-13, moved fully off fal.ai onto
      // RunPod Hub Public Endpoints 2026-07-14 — see src/libs/RunPod.ts's
      // "RunPod Hub Public Endpoints" section for why). 2026-07-15: 'runpod'
      // (Standard) also moved off the dedicated worker-comfyui pod onto
      // RunPod's own public `black-forest-labs-flux-1-schnell` endpoint
      // (GPU-hour billing there meant idle time cost money even between
      // generations; the public endpoint is flat per-image and cheaper) —
      // the dedicated pod is now only used for the reference-image (img2img)
      // case, since the public Schnell endpoint has no img2img mode.
      const job = fluxEngine === 'fal_flux_dev'
        ? await submitRunPodPublicJob(
            'black-forest-labs-flux-1-dev',
            buildRunPodFluxDevInput({ prompt: modelPrompt, width: body.width, height: body.height, seed: body.seed }),
          )
        // qwen_image / wan_t2i (added 2026-07-15) are plain text-to-image
        // engines with no reference-image mode on their RunPod Public
        // Endpoints — a reference image attached while one of these is
        // selected is simply ignored, same as any other pure t2i model.
        : fluxEngine === 'qwen_image'
          ? await submitRunPodPublicJob(
              'qwen-image-t2i',
              buildQwenImageInput({ prompt: modelPrompt, width: body.width, height: body.height, seed: body.seed }),
            )
          : fluxEngine === 'wan_t2i'
            ? await submitRunPodPublicJob(
                'wan-2-6-t2i',
                buildWanT2IInput({ prompt: modelPrompt, width: body.width, height: body.height, seed: body.seed }),
              )
            : usingFluxReference
              ? await submitRunPodJob(
                  'flux',
                  buildFluxImg2ImgInput(img2imgWorkflow!, {
                    prompt: modelPrompt,
                    imageBase64: body.referenceImageBase64,
                    denoise: typeof body.denoise === 'number' ? body.denoise : 0.55,
                    seed: body.seed,
                  }),
                )
              : await submitRunPodPublicJob(
                  'black-forest-labs-flux-1-schnell',
                  buildRunPodFluxSchnellInput({ prompt: modelPrompt, width: body.width, height: body.height, seed: body.seed }),
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
      // Migrated to fal.ai's Wan 2.7 on 2026-07-13, migrated again 2026-07-14
      // to RunPod Hub's public "WAN 2.2 I2V 720p" endpoint (`wan-2-2-i2v-720`)
      // as part of retiring fal.ai entirely — see src/libs/RunPod.ts's "RunPod
      // Hub Public Endpoints" section. buildWanInput() already builds this
      // endpoint's exact input shape (it was originally written for it,
      // before the brief fal.ai detour). See wanCreditCost() in
      // src/libs/Pricing.ts for why the credit cost scales with
      // durationSeconds instead of a flat rate.
      const input = buildWanInput({
        prompt: modelPrompt,
        imageUrl: body.imageUrl,
        negativePrompt: body.negativePrompt,
        durationSeconds: body.durationSeconds,
        size: body.size,
        seed: body.seed,
      });

      const job = await submitRunPodPublicJob('wan-2-2-i2v-720', input);

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
    if (usingFaceSwapSwapMode) {
      // "2 зураг" mode — see buildNanoBanana2FaceSwapInput() comment for why
      // this calls the Nano Banana 2 Edit Public Endpoint instead of the
      // dedicated comfyui-faceswap-sdxl worker used by style mode below.
      const swapPrompt = 'Face swap: replace the face in the target photo with the uploaded face, keep everything else unchanged.';
      const input = buildNanoBanana2FaceSwapInput({
        targetImageUrl: body.imageUrl,
        faceImageUrl: body.faceImageUrl,
      });

      const job = await submitRunPodPublicJob('google-nano-banana-2-edit', input);

      const [row] = await db.insert(generationSchema).values({
        ownerId: userId,
        orgId: orgId ?? null,
        kind: 'face_swap',
        prompt: swapPrompt,
        jobId: job.id,
        status: job.status,
      }).returning({ id: generationSchema.id });

      return NextResponse.json({ kind: 'face_swap', jobId: job.id, status: job.status, generationId: row?.id });
    }

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
