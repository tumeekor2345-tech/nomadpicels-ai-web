import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TitleBar } from '@/features/dashboard/TitleBar';
import { GenerateForm } from '@/features/generate/GenerateForm';

export default async function CreateImagePage(props: {
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
        title={t('title_bar_image')}
        description={t('title_bar_description_image')}
      />

      <GenerateForm
        fixedKind="flux"
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
          queuedWithPosition: t('queued_with_position'),
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
          engineLabel: t('engine_label'),
          engineNames: {
            runpod: t('engine_runpod'),
            fal_flux_dev: t('engine_fal_flux_dev'),
            fal_nanobanana2: t('engine_fal_nanobanana2'),
            qwen_image: t('engine_qwen_image'),
            wan_t2i: t('engine_wan_t2i'),
          },
          engineHints: {
            runpod: t('engine_runpod_hint'),
            fal_flux_dev: t('engine_fal_flux_dev_hint'),
            fal_nanobanana2: t('engine_fal_nanobanana2_hint'),
            qwen_image: t('engine_qwen_image_hint'),
            wan_t2i: t('engine_wan_t2i_hint'),
          },
          styleLabel: t('style_label'),
          styleNames: {
            'none': t('style_none'),
            'photorealistic': t('style_photorealistic'),
            'cinematic': t('style_cinematic'),
            'anime': t('style_anime'),
            'illustration': t('style_illustration'),
            '3d': t('style_3d'),
            'watercolor': t('style_watercolor'),
            'cyberpunk': t('style_cyberpunk'),
            'fantasy': t('style_fantasy'),
            'noir': t('style_noir'),
            'retroPop': t('style_retro_pop'),
            'darkAcademia': t('style_dark_academia'),
            'vintagePolaroid': t('style_vintage_polaroid'),
            'comicBook': t('style_comic_book'),
          },
          aspectRatioLabel: t('aspect_ratio_label'),
          lensLabel: t('lens_label'),
          lensHint: t('lens_hint'),
          lensNames: {
            none: t('lens_none'),
            portrait: t('lens_portrait'),
            wide: t('lens_wide'),
            macro: t('lens_macro'),
            telephoto: t('lens_telephoto'),
            fisheye: t('lens_fisheye'),
            anamorphic: t('lens_anamorphic'),
          },
          referenceLabel: t('reference_label'),
          referenceHint: t('reference_hint'),
          referenceUpload: t('reference_upload'),
          referenceRemove: t('reference_remove'),
          referenceInfluenceLabel: t('reference_influence_label'),
          referenceInfluenceLow: t('reference_influence_low'),
          referenceInfluenceMedium: t('reference_influence_medium'),
          referenceInfluenceHigh: t('reference_influence_high'),
          enhanceButton: t('enhance_button'),
          enhancing: t('enhancing'),
          enhancePreviewTitle: t('enhance_preview_title'),
          enhanceEnglishPreviewTitle: t('enhance_english_preview_title'),
          enhanceTranslating: t('enhance_translating'),
          enhanceUse: t('enhance_use'),
          enhanceCancel: t('enhance_cancel'),
          enhanceNotConfigured: t('enhance_not_configured'),
          enhanceFailed: t('enhance_failed'),
          enhanceBlocked: t('enhance_blocked'),
          finalPromptTitle: t('final_prompt_title'),
          finalPromptHint: t('final_prompt_hint'),
          finalPromptLoading: t('final_prompt_loading'),
          finalPromptRefresh: t('final_prompt_refresh'),
          historyView: t('history_view'),
          historyLightboxClose: t('history_lightbox_close'),
        }}
      />
    </>
  );
};
