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
 * - `wan`: fastest path is RunPod Hub's pre-built public endpoint
 *   ("WAN 2.2 I2V 720p"), which has its OWN simplified input schema — it is
 *   NOT a worker-comfyui/raw-workflow endpoint. Once deployed to your
 *   account, RunPod's console shows an "API" tab with the exact request
 *   shape for that specific endpoint — copy it into buildWanInput() below
 *   instead of guessing.
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
