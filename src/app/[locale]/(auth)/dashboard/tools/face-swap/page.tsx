import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TitleBar } from '@/features/dashboard/TitleBar';
import { FaceSwapWorkspace } from '@/features/tools/FaceSwapWorkspace';
import { FACE_SWAP_STYLE_IDS } from '@/libs/FaceSwapStyles';
import { Link } from '@/libs/I18nNavigation';

export default async function FaceSwapPage(props: {
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
        title={t('face_swap_title')}
        description={t('face_swap_description')}
      />

      <FaceSwapWorkspace
        labels={{
          modeStyleLabel: t('face_swap_mode_style'),
          modeSwapLabel: t('face_swap_mode_swap'),
          styleLabel: t('face_swap_style_label'),
          styleLabels: Object.fromEntries(
            FACE_SWAP_STYLE_IDS.map(id => [id, t(`face_swap_style_${id}`)]),
          ) as Record<typeof FACE_SWAP_STYLE_IDS[number], string>,
          imageUrlLabel: t('image_url_label'),
          imageUrlPlaceholder: t('image_url_placeholder'),
          uploadLabel: t('face_swap_upload_label'),
          uploadButton: t('face_swap_upload_button'),
          uploadRemove: t('face_swap_upload_remove'),
          uploadOrUrlDivider: t('face_swap_upload_or_url'),
          uploadFailed: t('face_swap_upload_failed'),
          targetImageLabel: t('face_swap_target_image_label'),
          targetImageHint: t('face_swap_target_image_hint'),
          faceImageLabel: t('face_swap_face_image_label'),
          faceImageHint: t('face_swap_face_image_hint'),
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
