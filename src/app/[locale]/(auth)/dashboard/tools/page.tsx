import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TitleBar } from '@/features/dashboard/TitleBar';
import { ToolsClient } from '@/features/tools/ToolsClient';

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

      <ToolsClient
        labels={{
          restoreTitle: t('restore_title'),
          restoreDescription: t('restore_description'),
          faceSwapTitle: t('face_swap_title'),
          faceSwapDescription: t('face_swap_description'),
          voiceTitle: t('voice_title'),
          voiceDescription: t('voice_description'),
          imageUrlPlaceholder: t('image_url_placeholder'),
          run: t('run'),
          running: t('running'),
          queued: t('queued'),
          inProgress: t('in_progress'),
          failed: t('failed'),
          downloadLabel: t('download_label'),
          voiceUploadLabel: t('voice_upload_label'),
          voiceDeep: t('voice_deep'),
          voiceHigh: t('voice_high'),
          voiceFemale: t('voice_female'),
          voiceChild: t('voice_child'),
          voiceProcessing: t('voice_processing'),
        }}
      />
    </>
  );
};
