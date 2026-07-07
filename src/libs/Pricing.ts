/**
 * Credit packages sold via QPay. Kept in one place so the billing page,
 * checkout API route, and the business plan's pricing table all agree.
 *
 * Credit cost per generation (see /api/generate): flux (image) = 1 credit,
 * wan (video) = 8 credits.
 */
export type PackageId = 'starter' | 'active' | 'business';

export type CreditPackage = {
  id: PackageId;
  nameMn: string;
  amountMnt: number;
  credits: number;
  descriptionMn: string;
};

export const CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: 'starter',
    nameMn: 'Стартер',
    amountMnt: 10_000,
    credits: 100,
    descriptionMn: 'Нэг удаагийн худалдан авалт — туршиж эхлэхэд тохиромжтой',
  },
  {
    id: 'active',
    nameMn: 'Идэвхтэй',
    amountMnt: 25_000,
    credits: 300,
    descriptionMn: 'Хамгийн түгээмэл сонголт',
  },
  {
    id: 'business',
    nameMn: 'Бизнес',
    amountMnt: 60_000,
    credits: 800,
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
