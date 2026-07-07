import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BillingClient } from '@/features/billing/BillingClient';
import { TitleBar } from '@/features/dashboard/TitleBar';

export default async function BillingPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const t = await getTranslations({
    locale,
    namespace: 'BillingPage',
  });

  return (
    <>
      <TitleBar
        title={t('title_bar')}
        description={t('title_bar_description')}
      />

      <BillingClient
        labels={{
          title: t('title_bar'),
          balanceLabel: t('balance_label'),
          buy: t('buy'),
          buying: t('buying'),
          scanInstruction: t('scan_instruction'),
          waiting: t('waiting'),
          paid: t('paid'),
          failed: t('failed'),
          creditCostNote: t('credit_cost_note'),
        }}
      />
    </>
  );
};
