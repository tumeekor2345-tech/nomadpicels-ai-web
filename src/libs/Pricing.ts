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

export const CREDIT_COST = {
  flux: 1,
  wan: 8,
} as const;
