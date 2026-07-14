import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TitleBar } from '@/features/dashboard/TitleBar';
import { PhotoRestoreWorkspace } from '@/features/tools/PhotoRestoreWorkspace';
import { Link } from '@/libs/I18nNavigation';

export default async function PhotoRestorePage(props: {
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
        title={t('restore_title')}
        description={t('restore_description')}
      />

      <PhotoRestoreWorkspace
        labels={{
          imageUrlLabel: t('image_url_label'),
          imageUrlPlaceholder: t('image_url_placeholder'),
          run: t('run'),
          running: t('running'),
          queued: t('queued'),
          inProgress: t('in_progress'),
          failed: t('failed'),
          downloadLabel: t('download_label'),
          resultTitle: t('result_title'),
          resultEmpty: t('result_empty'),
          historyTitle: t('history_title'),
          historyEmpty: t('history_empty'),
          historyView: t('history_view'),
          historyLightboxClose: t('history_lightbox_close'),
        }}
      />
    </>
  );
};
