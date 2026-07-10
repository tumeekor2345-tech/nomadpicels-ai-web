'use client';

import type {
  CameraAngleId,
  ColorPaletteId,
  EffectId,
  StyleId,
} from '@/libs/ImagePresets';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CAMERA_ANGLE_PRESETS,
  COLOR_PALETTE_PRESETS,
  EFFECT_PRESETS,
  STYLE_PRESETS,
} from '@/libs/ImagePresets';
import {
  CAMERA_ANGLE_VISUALS,
  COLOR_PALETTE_VISUALS,
  EFFECT_VISUALS,
  STYLE_VISUALS,
} from '@/libs/PresetVisuals';
import { HistoryStrip } from './HistoryStrip';
import { PresetPicker } from './PresetPicker';

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

type StrengthId = 'light' | 'medium' | 'strong';

// Effect "strength" here means how much the image is allowed to change —
// unlike the AI Image panel's "reference influence" (which is inverted:
// high influence = low denoise), a stronger effect should mean a *higher*
// denoise, so this is its own, unrelated-to-ImagePresets map.
const STRENGTH_DENOISE: Record<StrengthId, number> = {
  light: 0.35,
  medium: 0.55,
  strong: 0.75,
};

const selectClassName = `
  flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3
  py-1 text-base shadow-xs outline-none
  focus-visible:border-ring focus-visible:ring-[3px]
  focus-visible:ring-ring/50
  md:text-sm
`;

type Labels = {
  styleLabel: string;
  styleLabels: Record<StyleId, string>;
  colorLabel: string;
  colorLabels: Record<ColorPaletteId, string>;
  effectLabel: string;
  effectLabels: Record<EffectId, string>;
  angleLabel: string;
  angleLabels: Record<CameraAngleId, string>;
  strengthLabel: string;
  strengthLight: string;
  strengthMedium: string;
  strengthStrong: string;
  imageUrlLabel: string;
  imageUrlPlaceholder: string;
  run: string;
  running: string;
  queued: string;
  inProgress: string;
  failed: string;
  downloadLabel: string;
  resultTitle: string;
  resultEmpty: string;
  historyTitle: string;
  historyEmpty: string;
};

export const ImageEffectWorkspace = (props: { labels: Labels }) => {
  const { labels } = props;
  const [imageUrl, setImageUrl] = useState('');
  const [styleId, setStyleId] = useState<StyleId>('none');
  const [colorPaletteId, setColorPaletteId] = useState<ColorPaletteId>('none');
  const [effectId, setEffectId] = useState<EffectId>('none');
  const [cameraAngleId, setCameraAngleId] = useState<CameraAngleId>('none');
  const [strength, setStrength] = useState<StrengthId>('medium');
  const [submitting, setSubmitting] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [resultSrc, setResultSrc] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pollStatus = async (jobId: string, startedAt: number) => {
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      setErrorText(labels.failed);
      setSubmitting(false);
      return;
    }

    const res = await fetch(`/api/generate/status?jobId=${jobId}`);
    const data = await res.json();

    if (!res.ok) {
      setErrorText(data.error ?? labels.failed);
      setSubmitting(false);
      return;
    }

    if (data.status === 'COMPLETED') {
      setSubmitting(false);
      setStatusText(null);
      if (data.output?.images?.[0]) {
        const image = data.output.images[0];
        setResultSrc(image.type === 'base64' ? `data:image/png;base64,${image.data}` : image.data);
      } else {
        setErrorText(labels.failed);
      }
      setHistoryKey(k => k + 1);
      return;
    }

    if (data.status === 'FAILED' || data.status === 'CANCELLED' || data.status === 'TIMED_OUT') {
      setSubmitting(false);
      setErrorText(data.output?.errors?.join(', ') ?? data.error ?? labels.failed);
      setHistoryKey(k => k + 1);
      return;
    }

    setStatusText(data.status === 'IN_QUEUE' ? labels.queued : labels.inProgress);
    pollTimer.current = setTimeout(pollStatus, POLL_INTERVAL_MS, jobId, startedAt);
  };

  const handleRun = async () => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
    }
    setErrorText(null);
    setResultSrc(null);
    setSubmitting(true);
    setStatusText(labels.queued);

    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'image_effect',
        imageUrl,
        styleId,
        colorPaletteId,
        effectId,
        cameraAngleId,
        denoise: STRENGTH_DENOISE[strength],
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setSubmitting(false);
      setStatusText(null);
      setErrorText(data.message ?? data.error ?? labels.failed);
      return;
    }

    pollStatus(data.jobId, Date.now());
  };

  return (
    <div className="
      grid grid-cols-1 gap-4
      lg:grid-cols-[380px_1fr]
    "
    >
      {/* Left: configuration */}
      <div className="flex flex-col gap-4 rounded-md bg-card p-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="image-effect-url">{labels.imageUrlLabel}</Label>
          <Input
            id="image-effect-url"
            type="url"
            required
            value={imageUrl}
            onChange={e => setImageUrl(e.target.value)}
            placeholder={labels.imageUrlPlaceholder}
          />
        </div>

        <PresetPicker
          label={labels.styleLabel}
          presets={STYLE_PRESETS}
          visuals={STYLE_VISUALS}
          labels={labels.styleLabels}
          value={styleId}
          onChange={setStyleId}
        />

        <PresetPicker
          label={labels.colorLabel}
          presets={COLOR_PALETTE_PRESETS}
          visuals={COLOR_PALETTE_VISUALS}
          labels={labels.colorLabels}
          value={colorPaletteId}
          onChange={setColorPaletteId}
        />

        <PresetPicker
          label={labels.effectLabel}
          presets={EFFECT_PRESETS}
          visuals={EFFECT_VISUALS}
          labels={labels.effectLabels}
          value={effectId}
          onChange={setEffectId}
        />

        <PresetPicker
          label={labels.angleLabel}
          presets={CAMERA_ANGLE_PRESETS}
          visuals={CAMERA_ANGLE_VISUALS}
          labels={labels.angleLabels}
          value={cameraAngleId}
          onChange={setCameraAngleId}
        />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="image-effect-strength">{labels.strengthLabel}</Label>
          <select
            id="image-effect-strength"
            className={selectClassName}
            value={strength}
            onChange={e => setStrength(e.target.value as StrengthId)}
          >
            <option value="light">{labels.strengthLight}</option>
            <option value="medium">{labels.strengthMedium}</option>
            <option value="strong">{labels.strengthStrong}</option>
          </select>
        </div>

        <Button type="button" disabled={submitting || !imageUrl} onClick={handleRun}>
          {submitting ? labels.running : labels.run}
        </Button>

        {statusText && <div className="text-sm text-muted-foreground">{statusText}</div>}
        {errorText && <div className="text-sm font-medium text-destructive">{errorText}</div>}
      </div>

      {/* Right: result + history */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-md bg-card p-5">
          <div className="text-sm font-semibold">{labels.resultTitle}</div>
          {resultSrc
            ? (
                <div className="flex flex-col gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resultSrc}
                    alt=""
                    className="
                      max-w-full rounded-md
                      sm:max-w-sm
                    "
                  />
                  <a
                    href={resultSrc}
                    download="image-effect.png"
                    className="text-sm text-primary underline"
                  >
                    {labels.downloadLabel}
                  </a>
                </div>
              )
            : (
                <div className="text-sm text-muted-foreground">{labels.resultEmpty}</div>
              )}
        </div>

        <HistoryStrip
          kind="image_effect"
          title={labels.historyTitle}
          emptyLabel={labels.historyEmpty}
          refreshKey={historyKey}
        />
      </div>
    </div>
  );
};
