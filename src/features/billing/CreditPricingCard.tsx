import type { CreditPackage } from '@/libs/Pricing';

/**
 * Marketing-page pricing card for a real NomadPixels AI credit package
 * (replaces the old boilerplate Free/Premium/Enterprise subscription cards,
 * which showed unrelated team-member/storage limits).
 */
export const CreditPricingCard = (props: {
  pkg: CreditPackage;
  button: React.ReactNode;
}) => {
  const { pkg } = props;

  return (
    <div className="rounded-xl border border-border px-6 py-8 text-center">
      <div className="text-lg font-semibold">{pkg.nameMn}</div>

      <div className="mt-3 flex items-center justify-center">
        <div className="text-4xl font-bold">
          {pkg.amountMnt.toLocaleString('mn-MN')}
          ₮
        </div>
      </div>

      <div className="mt-2 text-sm text-muted-foreground">
        {pkg.isStarter
          ? 'Нэг удаагийн QR төлбөр'
          : (
              <>
                {pkg.credits}
                {' '}
                кредит
              </>
            )}
      </div>

      <div className="mt-2 mb-5 text-sm text-muted-foreground">{pkg.descriptionMn}</div>

      {props.button}
    </div>
  );
};
