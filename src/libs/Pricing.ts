/**
 * Credit packages sold via QPay. Kept in one place so the billing page,
 * checkout API route, and the marketing pricing section all agree.
 *
 * Credit cost per generation (see /api/generate): flux (image) = 1 credit,
 * wan (video) = 8 credits.
 *
 * `starter_image` / `starter_video` are one-off, pay-per-generation QR
 * purchases (no ongoing balance to manage) — under the hood they just grant
 * exactly enough credits for a single generation of that type. The other
 * three are prepaid credit bundles.
 */
export type PackageId = 'starter_image' | 'starter_video' | 'active' | 'professional' | 'business';

export type CreditPackage = {
  id: PackageId;
  nameMn: string;
  amountMnt: number;
  credits: number;
  descriptionMn: string;
  /** True for the one-off "Стартер" QR purchases, shown separately in the UI. */
  isStarter?: boolean;
};

export const CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: 'starter_image',
    nameMn: 'Стартер — Зураг',
    amountMnt: 1_000,
    credits: 1,
    descriptionMn: 'Нэг зураг үүсгэх нэг удаагийн QR төлбөр',
    isStarter: true,
  },
  {
    id: 'starter_video',
    nameMn: 'Стартер — Бичлэг',
    amountMnt: 3_000,
    credits: 8,
    descriptionMn: 'Нэг видео үүсгэх нэг удаагийн QR төлбөр',
    isStarter: true,
  },
  {
    id: 'active',
    nameMn: 'Идэвхтэй',
    amountMnt: 19_000,
    credits: 100,
    descriptionMn: 'Хамгийн түгээмэл сонголт',
  },
  {
    id: 'professional',
    nameMn: 'Мэргэжлийн',
    amountMnt: 45_000,
    credits: 300,
    descriptionMn: 'Тогтмол бүтээдэг хэрэглэгчдэд зориулсан',
  },
  {
    id: 'business',
    nameMn: 'Бизнес',
    amountMnt: 70_000,
    credits: 1_000,
    descriptionMn: 'Агентлаг, дэлгүүрт зориулсан — тэргүүлэх дараалал',
  },
];

export function getPackage(id: string): CreditPackage | undefined {
  return CREDIT_PACKAGES.find(p => p.id === id);
}

/**
 * "AI Image" tool engine ids — the user picks which backend generates their
 * image. `runpod` (Standard) originally ran on a self-hosted Flux Schnell
 * pod (own dedicated worker-comfyui endpoint, GPU-hour billed — idle time
 * between generations still cost money). `fal_flux_dev` was added
 * 2026-07-13 hosted on fal.ai, then moved 2026-07-14 to RunPod Hub's own
 * Public Endpoint (`black-forest-labs-flux-1-dev`) after fal.ai's real
 * per-image billing turned out to run 5-10x its advertised rate. 2026-07-15:
 * `runpod` (Standard) also moved onto RunPod's public
 * `black-forest-labs-flux-1-schnell` endpoint ($0.0024/megapixel flat, zero
 * idle cost) for the same reason — see src/libs/RunPod.ts's "RunPod Hub
 * Public Endpoints" section and buildRunPodFluxSchnellInput(). The dedicated
 * worker-comfyui pod is now only used for Standard-engine requests with a
 * reference image (img2img — the public Schnell endpoint has no img2img
 * mode) plus Photo Restore/Image Effect/Face Swap, which still need it. The
 * ids themselves were kept unchanged (not renamed to `runpod_flux_dev`/etc.)
 * to avoid touching every file that references them. Flux.1 [dev] is a step
 * up in quality for a modest cost bump.
 *
 * 2026-07-15: added two more RunPod Public Endpoint models at the user's
 * request — `qwen_image` (Qwen Image) and `wan_t2i` (Alibaba WAN 2.6),
 * both plain text-to-image only (no reference-image/edit mode — a reference
 * image is simply ignored if attached while one of these is selected). See
 * buildQwenImageInput() / buildWanT2IInput() in src/libs/RunPod.ts.
 *
 * 2026-07-15: removed `fal_nanobanana2` (Nano Banana 2 / Google's model) from
 * this selector at the user's request — it was Edit-only (required a
 * reference image, silently falling back to Flux Dev otherwise), which was
 * confusing as a "AI Image" engine choice. The underlying RunPod Public
 * Endpoint (`google-nano-banana-2-edit`) is still used by Face Swap's
 * "2 зураг" (swap) mode — see buildNanoBanana2FaceSwapInput() in
 * src/libs/RunPod.ts and FACE_SWAP_PRO_CREDIT_COST below — that is untouched.
 */
export type FluxEngineId = 'runpod' | 'fal_flux_dev' | 'qwen_image' | 'wan_t2i';

export const CREDIT_COST = {
  flux: 1, // engine: 'runpod' — kept as the flat default for backward compatibility
  wan: 8, // legacy flat rate — superseded by wanCreditCost() below, kept here only as a fallback
  photo_restore: 2,
  face_swap: 3,
  image_effect: 2,
} as const;

/**
 * Face Swap's "2 зураг" (swap) mode — added 2026-07-15 at the user's request
 * to mirror imagine.art's Target Image + Your Face layout. Unlike the
 * original style-preset mode (comfyui-faceswap-sdxl, flat 3 credits, GENERATES
 * a new portrait from a text prompt), swap mode reuses the
 * `google-nano-banana-2-edit` RunPod Public Endpoint directly (see
 * buildNanoBanana2FaceSwapInput() in src/libs/RunPod.ts) — Nano Banana 2 is a
 * general instruction-following image editor capable of a real "replace only
 * the face, keep the rest of the photo" edit given two reference images.
 * This is independent of the "AI Image" tool's engine selector (which no
 * longer offers Nano Banana 2 as of 2026-07-15 — see FluxEngineId above);
 * Face Swap calls the endpoint on its own, flat-priced at 1K resolution.
 */
export const FACE_SWAP_PRO_CREDIT_COST = 6;

/**
 * Per-engine credit cost for the "AI Image" tool's engine selector. Priced
 * against RunPod Hub's official Public Endpoint rates
 * (docs.runpod.io/public-endpoints/reference) and the lowest per-credit
 * value across CREDIT_PACKAGES (Business, ~70₮/credit) so margin holds even
 * for bulk-package buyers:
 *   - fal_flux_dev (RunPod `black-forest-labs-flux-1-dev`, $0.02/megapixel):
 *     ~$0.021-0.047/image depending on aspect ratio -> 2 credits (140₮ min
 *     revenue) still comfortably covers it.
 *   - qwen_image (RunPod `qwen-image-t2i`, $0.02/image flat) -> 2 credits,
 *     same as fal_flux_dev (same ballpark real cost).
 *   - wan_t2i (RunPod `wan-2-6-t2i`, $0.03/image flat) -> 3 credits.
 */
export const FLUX_ENGINE_CREDIT_COST: Record<FluxEngineId, number> = {
  runpod: CREDIT_COST.flux,
  fal_flux_dev: 2,
  qwen_image: 2,
  wan_t2i: 3,
};

/**
 * RunPod Hub's public `wan-2-2-i2v-720` endpoint (see src/libs/RunPod.ts) is
 * billed at a flat $0.06/second ($0.30 for 5s, scaling linearly — confirmed
 * against docs.runpod.io/public-endpoints/models/wan-2-2-i2v), cheaper than
 * the brief fal.ai Wan 2.7 detour's $0.10/s. Credit cost was calibrated
 * against that higher fal.ai rate (32 credits / 5s, confirmed with the user
 * 2026-07-13) and kept unchanged after moving back to RunPod 2026-07-14 —
 * real margin is now better than originally calculated, not worse, so there
 * was no need to touch user-facing pricing.
 */
const WAN_CREDITS_PER_SECOND = 32 / 5;

export function wanCreditCost(durationSeconds: number): number {
  return Math.ceil(durationSeconds * WAN_CREDITS_PER_SECOND);
}
