import { Env } from '@/libs/Env';

/**
 * fal.ai client — managed API host for the 3 engines added 2026-07-13:
 *
 * - `fal-ai/flux/dev` (+ `/image-to-image`) — Flux.1 [dev], the "AI Image"
 *   tool's mid-tier engine. Costs ~$0.025/megapixel (fal.ai/pricing).
 * - `fal-ai/nano-banana-2` (+ `/edit`) — Google's Gemini 3.1 Flash Image,
 *   the top-tier engine (best identity/character consistency). Costs $0.08
 *   per 1K-resolution image (fal.ai/models/fal-ai/nano-banana-2/edit).
 * - `fal-ai/wan/v2.7/image-to-video` — replaces RunPod's Wan 2.2 entirely
 *   (no engine choice for video). Costs $0.10/second (fal.ai/wan-2.7).
 *
 * Docs: https://docs.fal.ai/model-endpoints/queue — this uses the plain
 * REST queue API (submit / status / result) rather than the JS SDK, to stay
 * consistent with how src/libs/RunPod.ts talks to RunPod (plain fetch, no
 * vendor SDK dependency).
 *
 * IMPORTANT — job id encoding: the rest of the app (generation DB rows,
 * /api/generate/status, client polling) was built around RunPod's model of
 * "one opaque jobId string, ask RunPod's status endpoint about it". fal's
 * queue API needs BOTH the model id and the request id to check status
 * (status URL is `queue.fal.run/{modelId}/requests/{requestId}/status`), so
 * a fal job's "jobId" as stored in generationSchema.jobId is the composite
 * string `fal::{modelId}::{requestId}` — see encodeFalJobId/decodeFalJobId
 * below. This avoids a DB schema migration; /api/generate/status just
 * detects the `fal::` prefix and routes to getFalJobStatus() instead of
 * RunPod's getRunPodJobStatus().
 */

const FAL_QUEUE_BASE_URL = 'https://queue.fal.run';
const FAL_JOB_ID_PREFIX = 'fal::';

export type FalModelId
  = | 'fal-ai/flux/dev'
    | 'fal-ai/flux/dev/image-to-image'
    | 'fal-ai/nano-banana-2'
    | 'fal-ai/nano-banana-2/edit'
    | 'fal-ai/wan/v2.7/image-to-video';

export type FalJobStatus = {
  id: string; // the composite `fal::{modelId}::{requestId}` string
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  output?: {
    images?: Array<{ filename: string; type: 'base64' | 's3_url'; data: string }>;
    result?: string; // video URL, mirrors RunPod Wan's { result: <url> } shape used by GenerateForm.tsx
    errors?: string[];
    [key: string]: unknown;
  };
  error?: string;
};

function requireFalEnv() {
  if (!Env.FAL_KEY) {
    throw new Error(
      'FAL_KEY is not set. Get a key at https://fal.ai/dashboard/keys and add it to '
      + 'Vercel\'s Environment Variables (or .env.local for local dev).',
    );
  }
}

function authHeaders(): HeadersInit {
  requireFalEnv();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Key ${Env.FAL_KEY}`,
  };
}

export function isFalJobId(jobId: string): boolean {
  return jobId.startsWith(FAL_JOB_ID_PREFIX);
}

function encodeFalJobId(modelId: FalModelId, requestId: string): string {
  return `${FAL_JOB_ID_PREFIX}${modelId}::${requestId}`;
}

function decodeFalJobId(jobId: string): { modelId: string; requestId: string } {
  const rest = jobId.slice(FAL_JOB_ID_PREFIX.length);
  const lastSep = rest.lastIndexOf('::');
  if (lastSep === -1) {
    throw new Error(`Malformed fal jobId: "${jobId}"`);
  }
  return { modelId: rest.slice(0, lastSep), requestId: rest.slice(lastSep + 2) };
}

/**
 * Submits a generation request to fal.ai's queue. Returns immediately with
 * a composite jobId — mirrors submitRunPodJob()'s shape (`{ id, status }`)
 * so /api/generate's route handlers barely need to branch.
 */
export async function submitFalJob(
  modelId: FalModelId,
  input: Record<string, unknown>,
): Promise<{ id: string; status: 'IN_QUEUE' }> {
  const res = await fetch(`${FAL_QUEUE_BASE_URL}/${modelId}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(`fal.ai submit failed (${modelId}): ${res.status} ${await res.text()}`);
  }

  const data = await res.json() as { request_id: string };
  return { id: encodeFalJobId(modelId, data.request_id), status: 'IN_QUEUE' };
}

/**
 * fal.ai's queue GET endpoints (status + result) are documented as plain
 * GETs (docs.fal.ai/model-endpoints/queue), and that's correct for some
 * models (e.g. fal-ai/nano-banana-2 — GET works, POST gets a 405 from the
 * app itself). But for others (e.g. fal-ai/flux/dev) a GET is rejected with
 * an edge-level 405 (empty body, before reaching fal's app layer at all —
 * reproduced independently with an unauthenticated browser fetch), while
 * POST to the exact same URL reaches the app fine. This looks like a
 * fal-side inconsistency (matches a report of the same GET-405 symptom in
 * fal's own community forum), not something we can predict per model ahead
 * of time. So: try GET first (the documented, "correct" method), and only
 * if that specific edge-level 405 happens, retry once with POST.
 */
async function fetchFalQueue(url: string): Promise<Response> {
  const getRes = await fetch(url, { method: 'GET', headers: authHeaders() });
  if (getRes.status !== 405) {
    return getRes;
  }
  return fetch(url, { method: 'POST', headers: authHeaders() });
}

/**
 * Checks status of a previously submitted fal job and, once COMPLETED,
 * fetches + normalizes the result into the same `{ images: [...] }` /
 * `{ result: <videoUrl> }` shape RunPod jobs use — so ImageEffectWorkspace,
 * GenerateForm, etc. don't need separate rendering code paths for fal vs
 * RunPod output.
 */
export async function getFalJobStatus(jobId: string): Promise<FalJobStatus> {
  const { modelId, requestId } = decodeFalJobId(jobId);

  const statusRes = await fetchFalQueue(`${FAL_QUEUE_BASE_URL}/${modelId}/requests/${requestId}/status`);

  if (!statusRes.ok) {
    throw new Error(`fal.ai status check failed (${modelId}): ${statusRes.status} ${await statusRes.text()}`);
  }

  const statusData = await statusRes.json() as {
    status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED';
    error?: string;
  };

  if (statusData.status !== 'COMPLETED') {
    return { id: jobId, status: statusData.status };
  }

  // fal has no separate FAILED status — a failed request shows up as
  // COMPLETED with an `error` field on the status response (per
  // docs.fal.ai/model-endpoints/queue). Surface that as FAILED so the
  // client's existing FAILED handling (same as RunPod) just works.
  if (statusData.error) {
    return { id: jobId, status: 'FAILED', error: statusData.error };
  }

  const resultRes = await fetchFalQueue(`${FAL_QUEUE_BASE_URL}/${modelId}/requests/${requestId}`);

  if (!resultRes.ok) {
    throw new Error(`fal.ai result fetch failed (${modelId}): ${resultRes.status} ${await resultRes.text()}`);
  }

  const result = await resultRes.json() as {
    images?: Array<{ url: string; content_type?: string }>;
    video?: { url: string };
  };

  if (result.images?.length) {
    return {
      id: jobId,
      status: 'COMPLETED',
      output: {
        images: result.images.map((img, i) => ({
          filename: `fal-${requestId}-${i}.png`,
          type: 's3_url', // reuses RunPod's "hosted URL, not inline base64" tag — see ImageEffectWorkspace.tsx's rawSrc logic
          data: img.url,
        })),
      },
    };
  }

  if (result.video?.url) {
    return { id: jobId, status: 'COMPLETED', output: { result: result.video.url } };
  }

  return { id: jobId, status: 'FAILED', error: 'fal.ai returned no images or video in the result.' };
}

// --- Input builders -------------------------------------------------------

/** `fal-ai/flux/dev` — text-to-image. */
export function buildFalFluxDevInput(params: {
  prompt: string;
  width?: number;
  height?: number;
  seed?: number;
}) {
  return {
    prompt: params.prompt,
    image_size: { width: params.width ?? 1024, height: params.height ?? 1024 },
    num_inference_steps: 28,
    guidance_scale: 3.5,
    num_images: 1,
    seed: params.seed,
  };
}

/**
 * `fal-ai/flux/dev/image-to-image` — used when the "AI Image" tool's
 * reference-image feature is used with the fal_flux_dev engine. `strength`
 * plays the same role as RunPod's `denoise` (how much of the reference to
 * redraw vs preserve).
 */
export function buildFalFluxDevImg2ImgInput(params: {
  prompt: string;
  imageBase64DataUrl: string;
  strength?: number;
  seed?: number;
}) {
  return {
    prompt: params.prompt,
    image_url: params.imageBase64DataUrl, // fal accepts base64 data: URIs directly, no separate upload needed
    strength: params.strength ?? 0.55,
    num_inference_steps: 28,
    guidance_scale: 3.5,
    seed: params.seed,
  };
}

/** `fal-ai/nano-banana-2` — text-to-image. */
export function buildFalNanoBanana2Input(params: { prompt: string }) {
  return {
    prompt: params.prompt,
    resolution: '1K' as const,
    num_images: 1,
  };
}

/**
 * `fal-ai/nano-banana-2/edit` — image editing (identity-preserving img2img).
 * Takes an array of reference images (`image_urls`), not a single
 * `image_url` — base64 data: URIs work directly here too.
 */
export function buildFalNanoBanana2EditInput(params: {
  prompt: string;
  imageBase64DataUrl: string;
}) {
  return {
    prompt: params.prompt,
    image_urls: [params.imageBase64DataUrl],
    resolution: '1K' as const,
    num_images: 1,
  };
}

/**
 * `fal-ai/wan/v2.7/image-to-video` — replaces RunPod's Wan 2.2 entirely.
 * All Wan 2.7 endpoints are flat-rate $0.10/second regardless of resolution
 * (fal.ai/wan-2.7), so unlike the old RunPod Hub endpoint there's no
 * separate cost tier for 720p vs 1080p — this defaults to 720p to match the
 * existing UI's implied quality level.
 */
export function buildFalWanInput(params: {
  imageUrl: string;
  prompt: string;
  negativePrompt?: string;
  durationSeconds?: 5 | 8 | 10 | 15;
  size?: '1280*720' | '720*1280';
  seed?: number;
}) {
  return {
    prompt: params.prompt,
    image_url: params.imageUrl,
    negative_prompt: params.negativePrompt ?? '',
    resolution: '720p' as const,
    aspect_ratio: params.size === '720*1280' ? '9:16' as const : '16:9' as const,
    duration: params.durationSeconds ?? 5,
    seed: params.seed,
  };
}
