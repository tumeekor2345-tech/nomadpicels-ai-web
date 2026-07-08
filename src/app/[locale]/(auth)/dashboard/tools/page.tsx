import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TitleBar } from '@/features/dashboard/TitleBar';
import { ToolsGallery } from '@/features/tools/ToolsGallery';

export default async function ToolsPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const t = await getTranslations({
    locale,
    namespace: 'ToolsPage',
  });

  return (
    <>
      <TitleBar
        title={t('title_bar')}
        description={t('title_bar_description')}
      />

      <ToolsGallery
        labels={{
          restoreTitle: t('restore_title'),
          restoreDescription: t('restore_description'),
          faceSwapTitle: t('face_swap_title'),
          faceSwapDescription: t('face_swap_description'),
          voiceTitle: t('voice_title'),
          voiceDescription: t('voice_description'),
          open: t('open'),
        }}
      />
    </>
  );
};
