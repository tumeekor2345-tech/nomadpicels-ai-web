import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TitleBar } from '@/features/dashboard/TitleBar';
import { GenerateForm } from '@/features/generate/GenerateForm';

export default async function CreatePage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const t = await getTranslations({
    locale,
    namespace: 'CreatePage',
  });

  return (
    <>
      <TitleBar
        title={t('title_bar')}
        description={t('title_bar_description')}
      />

      <GenerateForm
        labels={{
          imageTab: t('image_tab'),
          videoTab: t('video_tab'),
          promptLabel: t('prompt_label'),
          promptPlaceholder: t('prompt_placeholder'),
          imageUrlLabel: t('image_url_label'),
          imageUrlPlaceholder: t('image_url_placeholder'),
          durationLabel: t('duration_label'),
          submit: t('submit'),
          submitting: t('submitting'),
          queued: t('queued'),
          inProgress: t('in_progress'),
          failed: t('failed'),
          fluxNotConfigured: t('flux_not_configured'),
          downloadLabel: t('download_label'),
          historyTitle: t('history_title'),
          historyEmpty: t('history_empty'),
          resultTitle: t('result_title'),
          resultEmpty: t('result_empty'),
          costNoteImage: t('cost_note_image'),
          costNoteVideo: t('cost_note_video'),
        }}
      />
    </>
  );
};
