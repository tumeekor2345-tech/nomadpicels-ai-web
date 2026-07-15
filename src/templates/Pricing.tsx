import { useTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/buttonVariants';
import { CreditPricingCard } from '@/features/billing/CreditPricingCard';
import { Section } from '@/features/landing/Section';
import { Link } from '@/libs/I18nNavigation';
import { CREDIT_PACKAGES } from '@/libs/Pricing';

export const Pricing = () => {
  const t = useTranslations('Pricing');

  return (
    <Section
      id="pricing"
      subtitle={t('section_subtitle')}
      title={t('section_title')}
      description={t('section_description')}
    >
      <div className="
        grid grid-cols-1 gap-x-6 gap-y-8
        @xl:grid-cols-2
        @4xl:grid-cols-3
      "
      >
        {CREDIT_PACKAGES.map(pkg => (
          <CreditPricingCard
            key={pkg.id}
            pkg={pkg}
            button={(
              <Link
                className={buttonVariants({
                  size: 'sm',
                  className: 'w-full',
                })}
                href="/sign-up"
              >
                {t('button_text')}
              </Link>
            )}
          />
        ))}
      </div>
    </Section>
  );
};
