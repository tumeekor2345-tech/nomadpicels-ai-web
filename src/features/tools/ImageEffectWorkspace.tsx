'use client';

import type {
  CameraAngleId,
  ColorPaletteId,
  EffectId,
  StyleId,
} from '@/libs/ImagePresets';
import type { ChangeEvent } from 'react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  CAMERA_ANGLE_PRESETS,
  COLOR_PALETTE_PRESETS,
  EFFECT_PRESETS,
  STYLE_PRESETS,
} from '@/libs/ImagePresets';
import { COLOR_PALETTE_FILTERS, STYLE_FILTERS } from '@/libs/ColorFilters';
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
//
// Raised 2026-07-10 (round 2): even the first bump (0.5/0.7/0.88) wasn't
// enough — user tested "Хүчтэй" (strong, 0.88) and still called the change
// too small. Pushing further so "Хүчтэй" is now close to a full repaint
// (0.97 — just short of 1.0/pure txt2img, to keep a thread of continuity
// with the uploaded photo's framing), "Дунд" now sits where "Хүчтэй" used
// to be, and "Хөнгөн" moves up to what used to be "Дунд" so the whole scale
// shifts toward "more transformed" as requested.
const STRENGTH_DENOISE: Record<StrengthId, number> = {
  light: 0.7,
  medium: 0.85,
  strong: 0.97,
};

// Uploaded photos are downscaled client-side before being sent as a data URI
// — keeps the request body well under Vercel's serverless body-size limit
// and speeds up the RunPod img2img step, since thumbnail-grade output is all
// this tool needs anyway.
const MAX_UPLOAD_DIMENSION = 1280;

function resizeImageFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_UPLOAD_DIMENSION || height > MAX_UPLOAD_DIMENSION) {
          const scale = MAX_UPLOAD_DIMENSION / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('canvas not supported'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('image load failed'));
      img.src = typeof reader.result === 'string' ? reader.result : '';
    };
    reader.onerror = () => reject(new Error('file read failed'));
    reader.readAsDataURL(file);
  });
}

// Applies a deterministic CSS color-grade filter to the AI output — see
// src/libs/ColorFilters.ts for why this exists (the model doesn't always
// fully honor a plain-text color instruction like "black and white" on its
// own, especially at low/medium denoise, so this is a guarantee layered on
// top of the prompt hint rather than a replacement for it).
function applyColorFilter(pngDataUrl: string, filter: string): Promise<string> {
  if (!filter) {
    return Promise.resolve(pngDataUrl);
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(pngDataUrl);
          return;
        }
        ctx.filter = filter;
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        // Falls back to the un-graded AI output rather than hanging forever
        // (e.g. a tainted-canvas SecurityError if the source ever turns out
        // to be a cross-origin URL instead of a data: URI) — logged so it's
        // visible in devtools if this path ever actually fires.
        // eslint-disable-next-line no-console
        console.error('applyColorFilter failed, showing ungraded image', err);
        resolve(pngDataUrl);
      }
    };
    img.onerror = () => resolve(pngDataUrl);
    img.src = pngDataUrl;
  });
}

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
  imageUploadLabel: string;
  imageUploadButton: string;
  imageUploadRemove: string;
  imageUploadHint: string;
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
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
        const rawSrc = image.type === 'base64' ? `data:image/png;base64,${image.data}` : image.data;
        const filter = [STYLE_FILTERS[styleId], COLOR_PALETTE_FILTERS[colorPaletteId]]
          .filter(Boolean)
          .join(' ');
        applyColorFilter(rawSrc, filter).then(setResultSrc);
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

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file after removing it
    if (!file) {
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      const dataUrl = await resizeImageFileToDataUrl(file);
      setImageUrl(dataUrl);
    } catch {
      setUploadError(labels.failed);
    } finally {
      setUploading(false);
    }
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
          <Label>{labels.imageUploadLabel}</Label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          {imageUrl
            ? (
                <div className="flex flex-col gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt=""
                    className="max-h-48 w-full rounded-md object-cover"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {labels.imageUploadButton}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setImageUrl('')}
                    >
                      {labels.imageUploadRemove}
                    </Button>
                  </div>
                </div>
              )
            : (
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? labels.running : labels.imageUploadButton}
                  </Button>
                  <p className="text-xs text-muted-foreground">{labels.imageUploadHint}</p>
                </div>
              )}
          {uploadError && <div className="text-sm font-medium text-destructive">{uploadError}</div>}
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
