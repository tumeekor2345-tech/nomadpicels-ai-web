import { Env } from '@/libs/Env';

/**
 * RunPod Serverless client — Flux (image) + Wan 2.2 (video) generation.
 *
 * Docs: https://docs.runpod.io/serverless/endpoints/send-requests
 *
 * IMPORTANT — the two kinds use DIFFERENT input contracts:
 *
 * - `flux`: deployed as `runpod/worker-comfyui:5.8.5-flux1-schnell` (see
 *   https://github.com/runpod-workers/worker-comfyui). Its `/run` input is
 *   `{ input: { workflow: <full ComfyUI API-format JSON>, images?: [...] } }`.
 *   You get that workflow JSON by building the graph once in ComfyUI, then
 *   `Workflow > Export (API)`. Save it as `src/libs/workflows/flux-schnell-txt2img.json`
 *   (see src/libs/workflows/README.md) — do NOT invent the graph by hand.
 *
 * - `wan`: 2026-07-14 — routed directly at RunPod Hub's public "WAN 2.2 I2V
 *   720p" endpoint (`wan-2-2-i2v-720`, see the "RunPod Hub Public Endpoints"
 *   section below) via submitRunPodPublicJob(), NOT through this file's
 *   dedicated-endpoint submitRunPodJob()/RUNPOD_WAN_ENDPOINT_ID path — no
 *   per-account deploy step needed, it's called the same way as the Flux
 *   Dev / Nano Banana 2 public endpoints. buildWanInput() below still builds
 *   the correct input shape for it.
 *
 * Usage:
 *   const job = await runSyncRunPodJob('flux', buildFluxInput({ prompt }));
 *   const images = extractImages(job);
 */

const RUNPOD_BASE_URL = 'https://api.runpod.ai/v2';

export type GenerationKind = 'flux' | 'wan' | 'faceswap';

export type RunPodJobStatus = {
  id: string;
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'TIMED_OUT';
  output?: {
    images?: Array<{ filename: string; type: 'base64' | 's3_url'; data: string }>;
    errors?: string[];
    [key: string]: unknown; // the Wan Hub endpoint's output shape may differ — verify once deployed
  };
  error?: string;
};

/**
 * RUNPOD_* vars are optional in Env.ts until Phase 2, so `npm run dev` boots
 * without them. This guard only fires if these functions are actually
 * called (e.g. from the Create page) before the keys are set.
 */
function requireRunPodEnv() {
  if (!Env.RUNPOD_API_KEY) {
    throw new Error(
      'RUNPOD_API_KEY is not set. Add it to .env.local — see RUNPOD_API_KEY in .env.local.example.',
    );
  }
}

function endpointIdFor(kind: GenerationKind): string {
  requireRunPodEnv();
  const endpointId = kind === 'flux'
    ? Env.RUNPOD_FLUX_ENDPOINT_ID
    : kind === 'wan'
      ? Env.RUNPOD_WAN_ENDPOINT_ID
      : Env.RUNPOD_FACESWAP_ENDPOINT_ID;
  if (!endpointId) {
    const varName = kind === 'flux' ? 'RUNPOD_FLUX_ENDPOINT_ID' : kind === 'wan' ? 'RUNPOD_WAN_ENDPOINT_ID' : 'RUNPOD_FACESWAP_ENDPOINT_ID';
    throw new Error(`${varName} is not set. Add it to .env.local.`);
  }
  return endpointId;
}

function authHeaders(): HeadersInit {
  requireRunPodEnv();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${Env.RUNPOD_API_KEY}`,
  };
}

/**
 * Submits an async generation job (returns immediately with a job id).
 * Use this for video (Wan 2.2), which can take longer than a request timeout.
 */
export async function submitRunPodJob(
  kind: GenerationKind,
  input: Record<string, unknown>,
): Promise<RunPodJobStatus> {
  const endpointId = endpointIdFor(kind);
  const res = await fetch(`${RUNPOD_BASE_URL}/${endpointId}/run`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ input }),
  });

  if (!res.ok) {
    throw new Error(`RunPod submit failed (${kind}): ${res.status} ${await res.text()}`);
  }

  return res.json() as Promise<RunPodJobStatus>;
}

/**
 * Runs a job synchronously and waits for the result (RunPod holds the
 * connection open, up to ~90s before you should switch to submit+poll).
 * Good for fast Flux-schnell image generations. For Wan 2.2 video, prefer
 * submitRunPodJob + pollRunPodJob since it can take longer.
 */
export async function runSyncRunPodJob(
  kind: GenerationKind,
  input: Record<string, unknown>,
): Promise<RunPodJobStatus> {
  const endpointId = endpointIdFor(kind);
  const res = await fetch(`${RUNPOD_BASE_URL}/${endpointId}/runsync`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ input }),
  });

  if (!res.ok) {
    throw new Error(`RunPod runsync failed (${kind}): ${res.status} ${await res.text()}`);
  }

  return res.json() as Promise<RunPodJobStatus>;
}

/** Checks the status of a previously submitted job. */
export async function getRunPodJobStatus(
  kind: GenerationKind,
  jobId: string,
): Promise<RunPodJobStatus> {
  const endpointId = endpointIdFor(kind);
  const res = await fetch(`${RUNPOD_BASE_URL}/${endpointId}/status/${jobId}`, {
    headers: authHeaders(),
  });

  if (!res.ok) {
    throw new Error(`RunPod status check failed (${kind}): ${res.status} ${await res.text()}`);
  }

  return res.json() as Promise<RunPodJobStatus>;
}

/** Cancels a queued or in-progress job (e.g. user closed the tab). */
export async function cancelRunPodJob(kind: GenerationKind, jobId: string): Promise<void> {
  const endpointId = endpointIdFor(kind);
  await fetch(`${RUNPOD_BASE_URL}/${endpointId}/cancel/${jobId}`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

// --- RunPod Hub "Public Endpoints" -----------------------------------------
//
// 2026-07-14: replaced ALL fal.ai usage (Mid-tier Flux Dev, Top-tier Nano
// Banana 2, Wan video) with RunPod's own Hub "Public Endpoints" — these are
// pre-deployed, shared serverless endpoints (same /run + /status/{id} +
// /runsync contract as the dedicated worker-comfyui endpoint above, just a
// fixed, publicly-known endpoint id instead of one you deploy yourself — no
// RUNPOD_*_ENDPOINT_ID env var or per-account setup needed). Reasons for the
// switch, discovered live this session:
//   - fal.ai's real per-image billing (checked on fal.ai's own usage
//     dashboard) ran 5-10x higher than its advertised $0.025/megapixel rate
//     for fal-ai/flux/dev, for reasons never fully pinned down.
//   - RunPod's equivalent public endpoints are priced transparently per the
//     official docs (docs.runpod.io/public-endpoints/reference) and come out
//     cheaper even at face value: Flux Dev $0.02/MP (~$0.021/image at
//     1024x1024) vs fal's advertised $0.025/MP — and vastly cheaper than
//     fal's real observed cost.
//   - One fewer vendor/API surface to keep healthy (no separate FAL_KEY,
//     no separate queue-position/polling-inconsistency quirks like fal's
//     GET-405-then-POST-fallback behavior documented in the old Fal.ts).
//
// Job id encoding: like fal's composite jobId, a RunPod Public Endpoint job
// needs BOTH the endpoint id and RunPod's own request id to check status
// later (status URL is `/{endpointId}/status/{requestId}`), so the "jobId"
// stored in generationSchema.jobId for these is the composite string
// `rpub::{endpointId}::{requestId}` — see encodeRunPodPublicJobId /
// decodeRunPodPublicJobId below. /api/generate/status detects the `rpub::`
// prefix and routes here instead of the dedicated-endpoint or fal branches.

const RUNPOD_PUBLIC_JOB_PREFIX = 'rpub::';

/** The RunPod Hub Public Endpoint ids this app calls — see
 * docs.runpod.io/public-endpoints/reference for the full catalog. */
export type RunPodPublicEndpointId
  = | 'black-forest-labs-flux-1-schnell' // Standard "AI Image" engine — $0.0024/megapixel (added 2026-07-15, see buildRunPodFluxSchnellInput() comment)
    | 'black-forest-labs-flux-1-dev' // Mid-tier "AI Image" engine — $0.02/megapixel
    | 'google-nano-banana-2-edit' // Top-tier "AI Image" engine — $0.0875 (1K) / $0.13 (2K) / $0.175 (4K)
    | 'qwen-image-t2i' // "AI Image" engine — Qwen Image, text-to-image only — $0.02/image flat (added 2026-07-15, see buildQwenImageInput() comment)
    | 'wan-2-6-t2i' // "AI Image" engine — Alibaba WAN 2.6, text-to-image only — $0.03/image flat (added 2026-07-15, see buildWanT2IInput() comment)
    | 'wan-2-2-i2v-720'; // "AI Video" — $0.30/5s, $0.06/s flat beyond that

export function isRunPodPublicJobId(jobId: string): boolean {
  return jobId.startsWith(RUNPOD_PUBLIC_JOB_PREFIX);
}

function encodeRunPodPublicJobId(endpointId: RunPodPublicEndpointId, requestId: string): string {
  return `${RUNPOD_PUBLIC_JOB_PREFIX}${endpointId}::${requestId}`;
}

function decodeRunPodPublicJobId(jobId: string): { endpointId: string; requestId: string } {
  const rest = jobId.slice(RUNPOD_PUBLIC_JOB_PREFIX.length);
  const lastSep = rest.lastIndexOf('::');
  if (lastSep === -1) {
    throw new Error(`Malformed RunPod public-endpoint jobId: "${jobId}"`);
  }
  return { endpointId: rest.slice(0, lastSep), requestId: rest.slice(lastSep + 2) };
}

/** Submits a job to one of the 3 public endpoints above. Mirrors
 * submitFalJob()'s shape so /api/generate barely has to branch. */
export async function submitRunPodPublicJob(
  endpointId: RunPodPublicEndpointId,
  input: Record<string, unknown>,
): Promise<{ id: string; status: 'IN_QUEUE' }> {
  requireRunPodEnv();
  const res = await fetch(`${RUNPOD_BASE_URL}/${endpointId}/run`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ input }),
  });

  if (!res.ok) {
    throw new Error(`RunPod public-endpoint submit failed (${endpointId}): ${res.status} ${await res.text()}`);
  }

  const data = await res.json() as { id: string };
  return { id: encodeRunPodPublicJobId(endpointId, data.id), status: 'IN_QUEUE' };
}

/** Normalized status shape shared with fal's FalJobStatus — GenerateForm.tsx
 * and /api/generate/status render both the same way. */
export type RunPodPublicJobStatus = {
  id: string;
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  output?: {
    images?: Array<{ filename: string; type: 's3_url'; data: string }>;
    result?: string; // video URL
    [key: string]: unknown;
  };
  error?: string;
};

/** Checks status of a previously submitted public-endpoint job and
 * normalizes RunPod's response shape into the same `{ images: [...] }` /
 * `{ result: <url> }` shape the rest of the app (RunPod worker-comfyui, fal)
 * already uses.
 *
 * 2026-07-15: the initial version of this function assumed a
 * `output.image_url` / `output.video_url` shape (guessed from docs
 * skimming) — live-tested against `black-forest-labs-flux-1-dev` and the
 * real COMPLETED payload turned out to be
 * `{ output: { cost: 0.012, result: "https://image.runpod.ai/.../result.jpeg" } }`.
 * So RunPod's Public Endpoints actually use a single `output.result` string
 * for the primary output URL regardless of media type — image endpoints put
 * an image URL there, `wan-2-2-i2v-720` puts a video URL there. We still
 * check the old `image_url`/`video_url` names first in case some other
 * endpoint uses them, then fall back to `result`, deciding image vs video
 * by endpointId (only `wan-2-2-i2v-720` is video). */
export async function getRunPodPublicJobStatus(jobId: string): Promise<RunPodPublicJobStatus> {
  const { endpointId, requestId } = decodeRunPodPublicJobId(jobId);

  const res = await fetch(`${RUNPOD_BASE_URL}/${endpointId}/status/${requestId}`, {
    headers: authHeaders(),
  });

  // 2026-07-13 lesson learned the hard way with fal.ai's equivalent check
  // (see the old src/libs/Fal.ts): throwing here turns a single transient
  // HTTP hiccup into a hard 502 from /api/generate/status, which
  // GenerateForm.tsx's pollStatus treats as a PERMANENT failure and stops
  // polling — even though the job itself may still be perfectly healthy.
  // Returning IN_PROGRESS instead lets the client's normal poll loop just
  // try again in a few seconds; a genuinely dead job still terminates
  // correctly via GenerateForm's own POLL_TIMEOUT_MS safety net.
  if (!res.ok) {
    return { id: jobId, status: 'IN_PROGRESS' };
  }

  const data = await res.json() as {
    status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
    error?: string;
    output?: { image_url?: string; video_url?: string; result?: string; cost?: number };
  };

  if (data.status !== 'COMPLETED') {
    return { id: jobId, status: data.status, error: data.error };
  }

  const isVideoEndpoint = endpointId === 'wan-2-2-i2v-720';

  if (data.output?.image_url) {
    return {
      id: jobId,
      status: 'COMPLETED',
      output: {
        images: [{ filename: `${requestId}.png`, type: 's3_url', data: data.output.image_url }],
      },
    };
  }

  if (data.output?.video_url) {
    return { id: jobId, status: 'COMPLETED', output: { result: data.output.video_url } };
  }

  if (data.output?.result && isVideoEndpoint) {
    return { id: jobId, status: 'COMPLETED', output: { result: data.output.result } };
  }

  if (data.output?.result) {
    return {
      id: jobId,
      status: 'COMPLETED',
      output: {
        images: [{ filename: `${requestId}.png`, type: 's3_url', data: data.output.result }],
      },
    };
  }

  return { id: jobId, status: 'FAILED', error: 'RunPod public endpoint returned no image or video in the result.' };
}

/** `black-forest-labs-flux-1-schnell` — text-to-image, Standard engine.
 * Added 2026-07-15 to replace the dedicated worker-comfyui Flux Schnell pod
 * (GPU-hour billed, idle time still costs money) with RunPod Hub's own
 * Public Endpoint for the same model ($0.0024/megapixel, zero idle cost —
 * confirmed via console.runpod.io/hub/playground/image/black-forest-labs-flux-1-schnell,
 * whose "API" tab shows the exact input shape used below). Schnell is a
 * timestep-distilled model — Black Forest Labs' own defaults use only 4
 * inference steps (vs Dev's 28) and it does NOT support img2img/reference
 * images on this endpoint, so /api/generate keeps using the dedicated
 * worker-comfyui endpoint (buildFluxImg2ImgInput) for Standard-engine
 * generations that include a reference image. */
export function buildRunPodFluxSchnellInput(params: {
  prompt: string;
  width?: number;
  height?: number;
  seed?: number;
}) {
  return {
    prompt: params.prompt,
    width: params.width ?? 1024,
    height: params.height ?? 1024,
    num_inference_steps: 4,
    guidance: 7,
    negative_prompt: '',
    seed: params.seed ?? -1,
    image_format: 'png',
  };
}

/** `black-forest-labs-flux-1-dev` — text-to-image, Mid-tier engine. */
export function buildRunPodFluxDevInput(params: {
  prompt: string;
  width?: number;
  height?: number;
  seed?: number;
}) {
  return {
    prompt: params.prompt,
    width: params.width ?? 1024,
    height: params.height ?? 1024,
    num_inference_steps: 28,
    guidance: 7.5,
    seed: params.seed ?? -1,
    image_format: 'png',
  };
}

/** `google-nano-banana-2-edit` — Top-tier engine. Requires at least one
 * reference image (RunPod's Public Endpoint catalog only offers the "Edit"
 * variant of Nano Banana 2, no pure text-to-image mode) — /api/generate's
 * route falls back to buildRunPodFluxDevInput() when the user hasn't
 * uploaded a reference image, per the 2026-07-14 decision to keep Top-tier
 * usable either way rather than blocking generation outright. */
export function buildRunPodNanoBanana2EditInput(params: {
  prompt: string;
  imageUrl: string;
  resolution?: '1k' | '2k' | '4k';
}) {
  return {
    images: [params.imageUrl],
    prompt: params.prompt,
    resolution: params.resolution ?? '1k',
    output_format: 'png',
  };
}

/** `qwen-image-t2i` — Qwen Image, text-to-image only "AI Image" engine.
 * Added 2026-07-15 alongside `wan-2-6-t2i` at the user's request. No
 * reference-image (edit) mode on this endpoint — /api/generate always calls
 * it with a plain text prompt regardless of whether the user attached a
 * reference image (the reference is simply ignored for this engine, same as
 * any other pure text-to-image model). Input shape confirmed via
 * console.runpod.io/hub/playground/image/qwen-image-t2i -> API tab. */
export function buildQwenImageInput(params: {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  seed?: number;
}) {
  return {
    prompt: params.prompt,
    negative_prompt: params.negativePrompt ?? '',
    size: `${params.width ?? 1328}*${params.height ?? 1328}`,
    seed: params.seed ?? -1,
    enable_safety_checker: true,
  };
}

/** `wan-2-6-t2i` — Alibaba WAN 2.6, text-to-image only "AI Image" engine.
 * Added 2026-07-15 alongside `qwen-image-t2i` at the user's request. Same
 * "no reference-image mode" caveat as buildQwenImageInput() above. Input
 * shape confirmed via console.runpod.io/hub/playground/image/wan-2-6-t2i ->
 * API tab. */
export function buildWanT2IInput(params: {
  prompt: string;
  width?: number;
  height?: number;
  seed?: number;
}) {
  return {
    prompt: params.prompt,
    size: `${params.width ?? 1024}*${params.height ?? 1024}`,
    seed: params.seed ?? -1,
    enable_safety_checker: true,
  };
}

/**
 * Simple poll helper for async jobs. In production, prefer a queue +
 * webhook/websocket push to the client instead of polling from a server
 * route, to avoid holding connections open.
 */
export async function pollRunPodJob(
  kind: GenerationKind,
  jobId: string,
  { intervalMs = 2000, timeoutMs = 300_000 }: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<RunPodJobStatus> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const status = await getRunPodJobStatus(kind, jobId);
    if (['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT'].includes(status.status)) {
      return status;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error(`RunPod job ${jobId} (${kind}) timed out after ${timeoutMs}ms`);
}

/**
 * Pulls generated image data out of a completed worker-comfyui job
 * (Flux). Returns base64 strings or S3 URLs depending on your worker's
 * S3 configuration — see docs/configuration.md in worker-comfyui.
 */
export function extractImages(status: RunPodJobStatus): Array<{ filename: string; type: 'base64' | 's3_url'; data: string }> {
  return status.output?.images ?? [];
}

// --- ComfyUI workflow patching (Flux) -----------------------------------

/** A ComfyUI "API format" workflow graph, keyed by node id. */
export type ComfyUIWorkflow = Record<string, {
  inputs: Record<string, unknown>;
  class_type: string;
  _meta?: { title?: string };
}>;

/**
 * Deep-clones a workflow and overwrites specific node inputs — e.g. the
 * CLIPTextEncode node's `text` field, or a KSampler's `seed`. Node ids come
 * from YOUR exported workflow.json (open it and search for the node you
 * want to control), not from this file.
 */
export function patchWorkflow(
  workflow: ComfyUIWorkflow,
  patches: Record<string, Record<string, unknown>>,
): ComfyUIWorkflow {
  const patched: ComfyUIWorkflow = JSON.parse(JSON.stringify(workflow));

  for (const [nodeId, inputs] of Object.entries(patches)) {
    if (!patched[nodeId]) {
      throw new Error(
        `Workflow node "${nodeId}" not found. Open your exported workflow.json and confirm the node id — `
        + `it changes if you rebuild the graph in ComfyUI.`,
      );
    }
    Object.assign(patched[nodeId].inputs, inputs);
  }

  return patched;
}

/**
 * Builds the `/run` or `/runsync` input for the Flux (worker-comfyui)
 * endpoint. Uses `src/libs/workflows/flux-schnell-txt2img.json` — this is the
 * official `workflow_flux1_schnell.json` example from the runpod-workers/
 * worker-comfyui repo (test_resources/workflows/), which matches exactly the
 * `runpod/worker-comfyui:5.8.5-flux1-schnell` image's baked-in model files
 * (flux1-schnell.safetensors, t5xxl_fp8_e4m3fn, clip_l, ae.safetensors) — so
 * the node ids below are confirmed correct for that image, not guessed.
 */
export function buildFluxInput(
  workflow: ComfyUIWorkflow,
  params: { prompt: string; width?: number; height?: number; seed?: number },
) {
  const FLUX_PROMPT_NODE_ID = '6'; // CLIPTextEncode (prompt)
  const FLUX_SIZE_NODE_ID = '5'; // EmptyLatentImage
  const FLUX_SEED_NODE_ID = '25'; // RandomNoise

  // NOTE: this workflow previously ran every generation through a
  // custom-trained Mongolian-style LoRA (LoraLoaderModelOnly node "30",
  // mnppl_mongolian_lora_v1.safetensors). Removed 2026-07-09 at the user's
  // request: even after lowering strength (0.7 -> 0.35) the LoRA's training
  // set (Wikimedia Commons portraits/headshots) kept biasing every
  // generation toward tight bust-crop framing regardless of the prompt's
  // requested composition, and building a better-balanced replacement
  // dataset was deprioritized. UNETLoader ("12") now feeds the sampler
  // nodes directly. Mongolian ethnicity/features are still steered via
  // plain-text prompt reinforcement — see
  // src/libs/EthnicityReinforcement.ts — which is unaffected by this
  // change. If a better-trained LoRA is built later, re-add a
  // LoraLoaderModelOnly node between "12" and "17"/"22" in
  // src/libs/workflows/flux-schnell-txt2img.json and patch its
  // strength_model here the same way.
  //
  // HI-RES FIX — added 2026-07-10 (1.5x latent upscale + second detail pass
  // via nodes 26/27/28/40), REMOVED the same day at the user's request: live
  // testing showed generations drifting away from the requested subject
  // (e.g. "Mongolian woman wearing a deel" produced unrelated clothing/
  // architecture) and roughly doubled generation time without a clear
  // quality win. At the time this was blamed on the hi-res pass itself and
  // reverted back to a single base pass (steps bumped 12 -> 20 "as a partial
  // substitute for the detail the hi-res pass was adding"). If hi-res fix is
  // revisited later, see git history around this date for the node graph
  // (LatentUpscaleBy "40" fed by the base SamplerCustomAdvanced "13", then a
  // second RandomNoise/BasicScheduler/SamplerCustomAdvanced at denoise ~0.45).
  //
  // STEPS FIX — 2026-07-13: the real cause of that subject-drift symptom was
  // almost certainly the step count, not the hi-res pass. flux1-schnell is a
  // timestep-distilled model — Black Forest Labs' own docs/default config
  // recommend 1-4 steps (up to ~8 at most); using more doesn't improve
  // quality and pushes sampling outside the regime the distillation assumed,
  // which can make the model detach from the prompt conditioning entirely and
  // generate confident-looking but unrelated photorealistic content (live
  // reproduced 2026-07-13: prompt "iphone 17promax" at steps=20 returned an
  // unrelated red building, then an unrelated motorcycle — same seed-driven
  // "different every time" pattern the hi-res-era bug reports described).
  // Dropped steps 20 -> 8 (the user's choice, staying at the very top of
  // schnell's documented 1-4-steps-typical/8-max range rather than the
  // stricter 4-step default) to get back inside schnell's actual
  // distillation target; flux-schnell-img2img.json's steps needed the same
  // fix. Re-test subject fidelity after this change before ever bumping
  // steps up again.
  const patched = patchWorkflow(workflow, {
    [FLUX_PROMPT_NODE_ID]: { text: params.prompt },
    [FLUX_SIZE_NODE_ID]: { width: params.width ?? 1024, height: params.height ?? 1024 },
    [FLUX_SEED_NODE_ID]: { noise_seed: params.seed ?? Math.floor(Math.random() * 1_000_000_000_000) },
  });

  return { workflow: patched };
}

/**
 * Builds the input for the Wan 2.2 endpoint (RunPod Hub's public
 * "Alibaba / Wan 2.2 I2V 720p" endpoint — id `wan-2-2-i2v-720`, confirmed
 * from console.runpod.io/hub/playground/video/wan-2-2-i2v-720 -> API tab).
 * This is a shared public endpoint: no deploy step needed, just call it with
 * your own RUNPOD_API_KEY (billed to your account).
 */
export function buildWanInput(params: {
  imageUrl: string;
  prompt: string;
  negativePrompt?: string;
  durationSeconds?: 5 | 8 | 10 | 15;
  size?: '1280*720' | '720*1280';
  numInferenceSteps?: number;
  guidance?: number;
  flowShift?: number;
  seed?: number;
  enablePromptOptimization?: boolean;
  enableSafetyChecker?: boolean;
}) {
  return {
    prompt: params.prompt,
    image: params.imageUrl,
    num_inference_steps: params.numInferenceSteps ?? 30,
    guidance: params.guidance ?? 5,
    negative_prompt: params.negativePrompt ?? '',
    size: params.size ?? '1280*720',
    duration: params.durationSeconds ?? 5,
    flow_shift: params.flowShift ?? 5,
    seed: params.seed ?? -1,
    enable_prompt_optimization: params.enablePromptOptimization ?? false,
    enable_safety_checker: params.enableSafetyChecker ?? true,
  };
}

// --- "Tools" feature: one-click photo restore + face swap ---------------

/**
 * Builds the input for an img2img Flux run (Photo Restore tool) —
 * `src/libs/workflows/flux-schnell-img2img.json` is the same graph as the
 * txt2img workflow with a LoadImage -> VAEEncode branch feeding the sampler's
 * latent_image instead of EmptyLatentImage, and a partial `denoise` so the
 * output stays close to the input photo. The uploaded image is sent as
 * base64 in the `images` array (worker-comfyui uploads it into ComfyUI's
 * input folder under this same filename before running the workflow), so no
 * external image hosting is needed.
 */
export function buildFluxImg2ImgInput(
  workflow: ComfyUIWorkflow,
  params: { prompt: string; imageBase64: string; denoise?: number; seed?: number },
) {
  const FLUX_PROMPT_NODE_ID = '6'; // CLIPTextEncode (prompt)
  const FLUX_SEED_NODE_ID = '25'; // RandomNoise
  const FLUX_DENOISE_NODE_ID = '17'; // BasicScheduler
  const FLUX_LOAD_IMAGE_NODE_ID = '30'; // LoadImage (added for img2img)
  const imageName = 'input.png';

  // NOTE: this workflow previously ran through a LoraLoaderModelOnly node
  // ("32", mnppl Mongolian-style LoRA) between UNETLoader ("12") and the
  // sampler nodes. Removed 2026-07-09 along with buildFluxInput()'s LoRA
  // node — see the comment there for why. UNETLoader ("12") now feeds the
  // sampler nodes directly.
  const patched = patchWorkflow(workflow, {
    [FLUX_PROMPT_NODE_ID]: { text: params.prompt },
    [FLUX_SEED_NODE_ID]: { noise_seed: params.seed ?? Math.floor(Math.random() * 1_000_000_000_000) },
    [FLUX_DENOISE_NODE_ID]: { denoise: params.denoise ?? 0.55 },
    [FLUX_LOAD_IMAGE_NODE_ID]: { image: imageName },
  });

  return {
    workflow: patched,
    images: [{ name: imageName, image: params.imageBase64 }],
  };
}

/**
 * Builds the input for `runpod/comfyui-faceswap-sdxl` (Face Swap tool) —
 * see https://github.com/runpod-workers/comfyui-faceswap-sdxl. Unlike the
 * Flux worker-comfyui endpoint, this is a purpose-built handler with its own
 * simple JSON schema (no raw ComfyUI workflow graph): give it a character
 * `prompt` plus a reference `image_url` and it generates a new portrait
 * carrying that face (IPAdapter + InstantID under the hood).
 */
export function buildFaceSwapInput(params: {
  prompt: string;
  imageUrl: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  seed?: number;
}) {
  return {
    prompt: params.prompt,
    negative_prompt: params.negativePrompt ?? 'bad quality, blurry, deformed',
    width: params.width ?? 832,
    height: params.height ?? 1216,
    steps: params.steps ?? 35,
    cfg: params.cfg ?? 2.0,
    seed: params.seed ?? Math.floor(Math.random() * 1_000_000_000),
    image_url: params.imageUrl,
    output: { include_base64: true, save_to_volume: false },
  };
}

/** Pulls the generated image out of a completed face-swap job. */
export function extractFaceSwapImage(status: RunPodJobStatus): string | null {
  const output = status.output as { image_base64?: string } | undefined;
  return output?.image_base64 ?? null;
}
