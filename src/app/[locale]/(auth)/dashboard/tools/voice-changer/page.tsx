import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TitleBar } from '@/features/dashboard/TitleBar';
import { VoiceChangerWorkspace } from '@/features/tools/VoiceChangerWorkspace';
import { Link } from '@/libs/I18nNavigation';

export default async function VoiceChangerPage(props: {
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
      <Link
        href="/dashboard/tools"
        className="
          mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground
          hover:text-foreground
        "
      >
        <ArrowLeft className="size-4" />
        {t('back_to_tools')}
      </Link>

      <TitleBar
        title={t('voice_title')}
        description={t('voice_description')}
      />

      <VoiceChangerWorkspace
        labels={{
          uploadLabel: t('voice_upload_label'),
          veryDeep: t('voice_very_deep'),
          deep: t('voice_deep'),
          female: t('voice_female'),
          high: t('voice_high'),
          child: t('voice_child'),
          robot: t('voice_robot'),
          processing: t('voice_processing'),
          playOriginal: t('voice_play_original'),
          failed: t('failed'),
          downloadLabel: t('download_label'),
          resultTitle: t('result_title'),
          resultEmpty: t('result_empty'),
        }}
      />
    </>
  );
};
