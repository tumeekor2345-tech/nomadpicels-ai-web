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
 * default). `fal_flux_dev` and `fal_nanobanana2` were added 2026-07-13,
 * both hosted on fal.ai (see src/libs/Fal.ts) — Flux.1 [dev] is a step up in
 * quality for a modest cost bump, Nano Banana 2 (Google Gemini 3.1 Flash
 * Image) costs the most but has meaningfully better identity/character
 * consistency, especially for reference-image generations.
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
 * Per-engine credit cost for the "AI Image" tool's 3-way selector (added
 * 2026-07-13). Priced against researched fal.ai rates and the lowest
 * per-credit value across CREDIT_PACKAGES (Business, ~70₮/credit) so margin
 * holds even for bulk-package buyers:
 *   - fal_flux_dev: ~90₮/image cost -> 2 credits (140₮ min revenue)
 *   - fal_nanobanana2: ~287₮/image cost (fal.ai $0.08 @ 1K) -> 6 credits (420₮ min revenue)
 */
export const FLUX_ENGINE_CREDIT_COST: Record<FluxEngineId, number> = {
  runpod: CREDIT_COST.flux,
  fal_flux_dev: 2,
  fal_nanobanana2: 6,
};

/**
 * Wan 2.7 (fal.ai) is billed at a flat $0.10/second (~358₮/s) with no
 * resolution tiers — unlike the old self-hosted RunPod Wan 2.2 (near-free
 * GPU-second cost, hence the old flat 8-credit price), so credit cost must
 * scale with the user-selected duration or longer videos lose money.
 * Calibrated at 32 credits for a 5-second video (~6.4 credits/second),
 * confirmed with the user on 2026-07-13, then scaled linearly and rounded
 * up for any other duration (8/10/15s).
 */
const WAN_CREDITS_PER_SECOND = 32 / 5;

export function wanCreditCost(durationSeconds: number): number {
  return Math.ceil(durationSeconds * WAN_CREDITS_PER_SECOND);
}
