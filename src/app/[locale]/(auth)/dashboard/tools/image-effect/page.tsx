import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TitleBar } from '@/features/dashboard/TitleBar';
import { ImageEffectWorkspace } from '@/features/tools/ImageEffectWorkspace';
import { Link } from '@/libs/I18nNavigation';

export default async function ImageEffectPage(props: {
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
        title={t('image_effect_title')}
        description={t('image_effect_description')}
      />

      <ImageEffectWorkspace
        labels={{
          styleLabel: t('image_effect_style_label'),
          styleLabels: {
            none: t('image_effect_style_none'),
            photorealistic: t('image_effect_style_photorealistic'),
            cinematic: t('image_effect_style_cinematic'),
            anime: t('image_effect_style_anime'),
            illustration: t('image_effect_style_illustration'),
            '3d': t('image_effect_style_3d'),
            watercolor: t('image_effect_style_watercolor'),
            cyberpunk: t('image_effect_style_cyberpunk'),
            fantasy: t('image_effect_style_fantasy'),
            noir: t('image_effect_style_noir'),
            retroPop: t('image_effect_style_retro_pop'),
            darkAcademia: t('image_effect_style_dark_academia'),
            vintagePolaroid: t('image_effect_style_vintage_polaroid'),
            comicBook: t('image_effect_style_comic_book'),
          },
          colorLabel: t('image_effect_color_label'),
          colorLabels: {
            none: t('image_effect_color_none'),
            warm: t('image_effect_color_warm'),
            cool: t('image_effect_color_cool'),
            vibrant: t('image_effect_color_vibrant'),
            pastel: t('image_effect_color_pastel'),
            blackAndWhite: t('image_effect_color_black_and_white'),
            sepia: t('image_effect_color_sepia'),
            highContrast: t('image_effect_color_high_contrast'),
            autumnHarvest: t('image_effect_color_autumn_harvest'),
            pearlIvory: t('image_effect_color_pearl_ivory'),
            jungleVivid: t('image_effect_color_jungle_vivid'),
            sunsetGradient: t('image_effect_color_sunset_gradient'),
          },
          effectLabel: t('image_effect_effect_label'),
          effectLabels: {
            none: t('image_effect_effect_none'),
            filmGrain: t('image_effect_effect_film_grain'),
            glow: t('image_effect_effect_glow'),
            hdr: t('image_effect_effect_hdr'),
            bokeh: t('image_effect_effect_bokeh'),
            moody: t('image_effect_effect_moody'),
            sharp: t('image_effect_effect_sharp'),
            motionBlur: t('image_effect_effect_motion_blur'),
            doubleExposure: t('image_effect_effect_double_exposure'),
            glitch: t('image_effect_effect_glitch'),
            lomo: t('image_effect_effect_lomo'),
          },
          angleLabel: t('image_effect_angle_label'),
          angleLabels: {
            none: t('image_effect_angle_none'),
            eyeLevel: t('image_effect_angle_eye_level'),
            lowAngle: t('image_effect_angle_low_angle'),
            highAngle: t('image_effect_angle_high_angle'),
            birdsEye: t('image_effect_angle_birds_eye'),
            closeUp: t('image_effect_angle_close_up'),
            wideShot: t('image_effect_angle_wide_shot'),
            portraitFraming: t('image_effect_angle_portrait_framing'),
            aerialView: t('image_effect_angle_aerial_view'),
            groundView: t('image_effect_angle_ground_view'),
            tiltShot: t('image_effect_angle_tilt_shot'),
          },
          imageUrlLabel: t('image_url_label'),
          imageUrlPlaceholder: t('image_url_placeholder'),
          imageUploadLabel: t('image_upload_label'),
          imageUploadButton: t('image_upload_button'),
          imageUploadRemove: t('image_upload_remove'),
          imageUploadHint: t('image_upload_hint'),
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
