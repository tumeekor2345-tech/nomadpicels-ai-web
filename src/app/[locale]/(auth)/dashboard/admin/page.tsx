import { auth } from '@clerk/nextjs/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { AdminClient } from '@/features/admin/AdminClient';
import { TitleBar } from '@/features/dashboard/TitleBar';
import { isAdminUser } from '@/libs/Admin';

export default async function AdminPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const { userId } = await auth();
  if (!(await isAdminUser(userId))) {
    notFound();
  }

  const t = await getTranslations({
    locale,
    namespace: 'AdminPage',
  });

  return (
    <>
      <TitleBar
        title={t('title_bar')}
        description={t('title_bar_description')}
      />

      <AdminClient
        labels={{
          rangeDay: t('range_day'),
          rangeWeek: t('range_week'),
          rangeMonth: t('range_month'),
          range3Months: t('range_3_months'),
          newUsers: t('new_users'),
          totalUsers: t('total_users'),
          revenue: t('revenue'),
          creditsSold: t('credits_sold'),
          paidOrders: t('paid_orders'),
          totalGenerations: t('total_generations'),
          generationsByKind: t('generations_by_kind'),
          kindFlux: t('kind_flux'),
          kindWan: t('kind_wan'),
          kindPhotoRestore: t('kind_photo_restore'),
          kindFaceSwap: t('kind_face_swap'),
          recentOrders: t('recent_orders'),
          recentOrdersEmpty: t('recent_orders_empty'),
          loading: t('loading'),
          failed: t('failed'),
        }}
      />
    </>
  );
};
