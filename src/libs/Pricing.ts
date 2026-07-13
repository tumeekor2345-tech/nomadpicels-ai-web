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
 * image. `runpod` is the original self-hosted Flux Schnell (cheapest,
 * default, own dedicated worker-comfyui endpoint). `fal_flux_dev` and
 * `fal_nanobanana2` were added 2026-07-13 hosted on fal.ai, then moved
 * 2026-07-14 to RunPod Hub's own Public Endpoints (`black-forest-labs-flux-1-dev`
 * / `google-nano-banana-2-edit` — see src/libs/RunPod.ts's "RunPod Hub Public
 * Endpoints" section) after fal.ai's real per-image billing turned out to run
 * 5-10x its advertised rate. The ids themselves were kept unchanged (not
 * renamed to `runpod_flux_dev`/etc.) to avoid touching every file that
 * references them. Flux.1 [dev] is a step up in quality for a modest cost
 * bump; Nano Banana 2 (Google's model) costs the most but has meaningfully
 * better identity/character consistency for reference-image generations —
 * RunPod's Public Endpoint for it is Edit-only (no bare reference image ->
 * falls back to the Flux Dev engine, see /api/generate/route.ts).
 */
export type FluxEngineId = 'runpod' | 'fal_flux_dev' | 'fal_nanobanana2';

export const CREDIT_COST = {
  flux: 1, // engine: 'runpod' — kept as the flat default for backward compatibility
  wan: 8, // legacy flat rate — superseded by wanCreditCost() below, kept here only as a fallback
  photo_restore: 2,
  face_swap: 3,
  image_effect: 2,
} as const;

/**
 * Per-engine credit cost for the "AI Image" tool's 3-way selector. Priced
 * against RunPod Hub's official Public Endpoint rates
 * (docs.runpod.io/public-endpoints/reference) and the lowest per-credit
 * value across CREDIT_PACKAGES (Business, ~70₮/credit) so margin holds even
 * for bulk-package buyers:
 *   - fal_flux_dev (RunPod `black-forest-labs-flux-1-dev`, $0.02/megapixel):
 *     ~$0.021-0.047/image depending on aspect ratio -> 2 credits (140₮ min
 *     revenue) still comfortably covers it.
 *   - fal_nanobanana2 (RunPod `google-nano-banana-2-edit`, $0.0875 @ 1K):
 *     -> 6 credits (420₮ min revenue).
 */
export const FLUX_ENGINE_CREDIT_COST: Record<FluxEngineId, number> = {
  runpod: CREDIT_COST.flux,
  fal_flux_dev: 2,
  fal_nanobanana2: 6,
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
