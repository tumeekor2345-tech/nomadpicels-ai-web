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
          voiceVeryDeep: t('voice_very_deep'),
          voiceDeep: t('voice_deep'),
          voiceFemale: t('voice_female'),
          voiceHigh: t('voice_high'),
          voiceChild: t('voice_child'),
          voiceRobot: t('voice_robot'),
          voiceProcessing: t('voice_processing'),
          voicePlayOriginal: t('voice_play_original'),
        }}
      />
    </>
  );
};
