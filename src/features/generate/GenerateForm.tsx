'use client';

import type {
  AspectRatioId,
  LensId,
  ReferenceInfluence,
  StyleId,
} from '@/libs/ImagePresets';
import { X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  ASPECT_RATIOS,
  buildFinalPrompt,
  LENS_PRESETS,
  REFERENCE_INFLUENCE_DENOISE,
  STYLE_PRESETS,
} from '@/libs/ImagePresets';
import { cn } from '@/utils/Helpers';

type Kind = 'flux' | 'wan';

type JobStatus = {
  id: string;
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'TIMED_OUT';
  output?: {
    images?: Array<{ filename: string; type: 'base64' | 's3_url'; data: string }>;
    errors?: string[];
    result?: string;
    [key: string]: unknown;
  };
  error?: string;
};

type HistoryItem = {
  id: number;
  kind: Kind;
  prompt: string;
  status: string;
  images?: Array<{ filename: string; type: string; data: string }>;
  rawOutput?: Record<string, unknown>;
  videoUrl?: string;
  errorMessage?: string | null;
  createdAt: string;
};

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

export const GenerateForm = (props: {
  labels: {
    imageTab: string;
    videoTab: string;
    promptLabel: string;
    promptPlaceholder: string;
    imageUrlLabel: string;
    imageUrlPlaceholder: string;
    durationLabel: string;
    submit: string;
    submitting: string;
    queued: string;
    inProgress: string;
    failed: string;
    fluxNotConfigured: string;
    downloadLabel: string;
    historyTitle: string;
    historyEmpty: string;
    resultTitle: string;
    resultEmpty: string;
    costNoteImage: string;
    costNoteVideo: string;
    styleLabel: string;
    styleNames: Record<StyleId, string>;
    aspectRatioLabel: string;
    lensLabel: string;
    lensHint: string;
    lensNames: Record<LensId, string>;
    referenceLabel: string;
    referenceHint: string;
    referenceUpload: string;
    referenceRemove: string;
    referenceInfluenceLabel: string;
    referenceInfluenceLow: string;
    referenceInfluenceMedium: string;
    referenceInfluenceHigh: string;
  };
  /**
   * When set, this form is locked to a single mode (dedicated Image or Video
   * page) — the Зураг/Видео toggle isn't rendered at all and `kind` never
   * changes. When omitted, falls back to the old ?tab= query param behavior
   * for any bookmarked links.
   */
  fixedKind?: Kind;
}) => {
  const searchParams = useSearchParams();
  const initialKind: Kind = props.fixedKind ?? (searchParams.get('tab') === 'video' ? 'wan' : 'flux');

  const [kind, setKind] = useState<Kind>(initialKind);
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [duration, setDuration] = useState<5 | 8 | 10 | 15>(5);
  const [style, setStyle] = useState<StyleId>('none');
  const [lens, setLens] = useState<LensId>('none');
  const [aspectRatio, setAspectRatio] = useState<AspectRatioId>('1:1');
  const [referenceImage, setReferenceImage] = useState<{ dataUrl: string; base64: string } | null>(null);
  const [referenceInfluence, setReferenceInfluence] = useState<ReferenceInfluence>('medium');
  const referenceInputRef = useRef<HTMLInputElement | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [images, setImages] = useState<Array<{ filename: string; type: string; data: string }>>([]);
  const [rawOutput, setRawOutput] = useState<Record<string, unknown> | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/generate/history')
      .then(res => res.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data.items)) {
          setHistory(data.items);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [historyRefreshKey]);

  const stopPolling = () => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  };

  const pollStatus = async (jobKind: Kind, jobId: string, startedAt: number) => {
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      setErrorText(props.labels.failed);
      setSubmitting(false);
      return;
    }

    const res = await fetch(`/api/generate/status?kind=${jobKind}&jobId=${jobId}`);
    const data: JobStatus = await res.json();

    if (!res.ok) {
      setErrorText(data.error ?? props.labels.failed);
      setSubmitting(false);
      return;
    }

    if (data.status === 'COMPLETED') {
      setSubmitting(false);
      setStatusText(null);
      if (data.output?.images?.length) {
        setImages(data.output.images);
      } else if (typeof data.output?.result === 'string') {
        // Wan 2.2 (Hub endpoint) returns { cost, result: <video url> }.
        setVideoUrl(data.output.result);
      } else if (data.output) {
        setRawOutput(data.output);
      }
      setHistoryRefreshKey(k => k + 1);
      return;
    }

    if (data.status === 'FAILED' || data.status === 'CANCELLED' || data.status === 'TIMED_OUT') {
      setSubmitting(false);
      setErrorText(data.output?.errors?.join(', ') ?? data.error ?? props.labels.failed);
      setHistoryRefreshKey(k => k + 1);
      return;
    }

    setStatusText(data.status === 'IN_QUEUE' ? props.labels.queued : props.labels.inProgress);
    pollTimer.current = setTimeout(pollStatus, POLL_INTERVAL_MS, jobKind, jobId, startedAt);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    stopPolling();
    setErrorText(null);
    setImages([]);
    setRawOutput(null);
    setVideoUrl(null);
    setSubmitting(true);
    setStatusText(props.labels.queued);

    const body = kind === 'flux'
      ? {
          kind,
          prompt: buildFinalPrompt(prompt, style, lens),
          width: ASPECT_RATIOS.find(r => r.id === aspectRatio)?.width,
          height: ASPECT_RATIOS.find(r => r.id === aspectRatio)?.height,
          ...(referenceImage
            ? {
                referenceImageBase64: referenceImage.base64,
                denoise: REFERENCE_INFLUENCE_DENOISE[referenceInfluence],
              }
            : {}),
        }
      : { kind, prompt, imageUrl, durationSeconds: duration };

    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok) {
      setSubmitting(false);
      setStatusText(null);
      setErrorText(
        data.error === 'flux_workflow_not_configured'
          ? props.labels.fluxNotConfigured
          : (data.message ?? data.error ?? props.labels.failed),
      );
      return;
    }

    pollStatus(kind, data.jobId, Date.now());
  };

  const handleReferenceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      const base64 = dataUrl.split(',')[1] ?? '';
      if (base64) {
        setReferenceImage({ dataUrl, base64 });
      }
    };
    reader.readAsDataURL(file);
    // Allow re-selecting the same file later after removing it.
    e.target.value = '';
  };

  const hasResult = images.length > 0 || !!videoUrl || !!rawOutput;

  return (
    <div className="
      grid grid-cols-1 items-start gap-6
      lg:grid-cols-[1fr_360px]
    "
    >
      {/* Main column: result + history */}
      <div className="flex flex-col gap-6">
        <div className="rounded-lg bg-card p-5">
          <div className="mb-3 text-sm font-semibold">{props.labels.resultTitle}</div>

          {statusText && (
            <div className="text-sm text-muted-foreground">{statusText}</div>
          )}

          {errorText && (
            <div className="text-sm font-medium text-destructive">{errorText}</div>
          )}

          {!hasResult && !statusText && !errorText && (
            <div className="text-sm text-muted-foreground">{props.labels.resultEmpty}</div>
          )}

          {images.length > 0 && (
            <div className="
              mt-2 grid grid-cols-1 gap-4
              sm:grid-cols-2
            "
            >
              {images.map((image) => {
                const src = image.type === 'base64'
                  ? `data:image/png;base64,${image.data}`
                  : image.data;
                return (
                  <div key={image.filename} className="flex flex-col gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={image.filename} className="rounded-md" />
                    <a
                      href={src}
                      download={image.filename}
                      className="text-sm text-primary underline"
                    >
                      {props.labels.downloadLabel}
                    </a>
                  </div>
                );
              })}
            </div>
          )}

          {videoUrl && (
            <div className="mt-2 flex flex-col gap-2">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video src={videoUrl} controls className="max-w-full rounded-md" />
              <a
                href={videoUrl}
                download
                className="text-sm text-primary underline"
              >
                {props.labels.downloadLabel}
              </a>
            </div>
          )}

          {rawOutput && (
            <pre className="
              mt-2 overflow-x-auto rounded-md bg-muted p-4 text-xs
            "
            >
              {JSON.stringify(rawOutput, null, 2)}
            </pre>
          )}
        </div>

        <div className="rounded-lg bg-card p-5">
          <div className="mb-3 text-sm font-semibold">{props.labels.historyTitle}</div>

          {history.length === 0
            ? (
                <div className="text-sm text-muted-foreground">{props.labels.historyEmpty}</div>
              )
            : (
                <div className="
                  grid grid-cols-2 gap-3
                  sm:grid-cols-3
                "
                >
                  {history.map(item => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-2 rounded-md bg-muted p-2"
                    >
                      {item.images?.[0] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.images[0].type === 'base64'
                            ? `data:image/png;base64,${item.images[0].data}`
                            : item.images[0].data}
                          alt={item.prompt}
                          className="aspect-square rounded-md object-cover"
                        />
                      )}
                      {item.videoUrl && (
                        // eslint-disable-next-line jsx-a11y/media-has-caption
                        <video
                          src={item.videoUrl}
                          controls
                          className="rounded-md"
                        />
                      )}
                      <div className="
                        line-clamp-2 text-xs text-muted-foreground
                      "
                      >
                        {item.prompt}
                      </div>
                    </div>
                  ))}
                </div>
              )}
        </div>
      </div>

      {/* Right column: generation settings panel */}
      <div className="
        rounded-lg bg-card p-5
        lg:sticky lg:top-20
      "
      >
        {!props.fixedKind && (
          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setKind('flux');
                setErrorText(null);
                setStatusText(null);
              }}
              className={cn(
                'flex-1 rounded-md px-3 py-2 text-sm font-medium',
                kind === 'flux'
                  ? 'bg-primary text-primary-foreground'
                  : `bg-muted text-muted-foreground`,
              )}
            >
              {props.labels.imageTab}
            </button>
            <button
              type="button"
              onClick={() => {
                setKind('wan');
                setErrorText(null);
                setStatusText(null);
              }}
              className={cn(
                'flex-1 rounded-md px-3 py-2 text-sm font-medium',
                kind === 'wan'
                  ? 'bg-primary text-primary-foreground'
                  : `bg-muted text-muted-foreground`,
              )}
            >
              {props.labels.videoTab}
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prompt">{props.labels.promptLabel}</Label>
            <Textarea
              id="prompt"
              required
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder={props.labels.promptPlaceholder}
              rows={5}
            />
          </div>

          {kind === 'flux' && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>{props.labels.styleLabel}</Label>
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  {STYLE_PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setStyle(preset.id)}
                      className={cn(
                        `
                          shrink-0 rounded-full border px-3 py-1.5 text-xs
                          font-medium whitespace-nowrap
                        `,
                        style === preset.id
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-transparent text-muted-foreground',
                      )}
                    >
                      {props.labels.styleNames[preset.id]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>{props.labels.aspectRatioLabel}</Label>
                <div className="flex flex-wrap gap-2">
                  {ASPECT_RATIOS.map(ratio => (
                    <button
                      key={ratio.id}
                      type="button"
                      onClick={() => setAspectRatio(ratio.id)}
                      className={cn(
                        'rounded-md border px-3 py-1.5 text-xs font-medium',
                        aspectRatio === ratio.id
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-transparent text-muted-foreground',
                      )}
                    >
                      {ratio.id}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>{props.labels.lensLabel}</Label>
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  {LENS_PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setLens(preset.id)}
                      className={cn(
                        `
                          shrink-0 rounded-full border px-3 py-1.5 text-xs
                          font-medium whitespace-nowrap
                        `,
                        lens === preset.id
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-transparent text-muted-foreground',
                      )}
                    >
                      {props.labels.lensNames[preset.id]}
                    </button>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground">{props.labels.lensHint}</div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>{props.labels.referenceLabel}</Label>
                <div className="text-xs text-muted-foreground">{props.labels.referenceHint}</div>

                <input
                  ref={referenceInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleReferenceFileChange}
                />

                {!referenceImage && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => referenceInputRef.current?.click()}
                  >
                    {props.labels.referenceUpload}
                  </Button>
                )}

                {referenceImage && (
                  <div className="flex flex-col gap-2">
                    <div className="relative w-fit">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={referenceImage.dataUrl}
                        alt="reference"
                        className="size-24 rounded-md object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setReferenceImage(null)}
                        className="
                          absolute -top-2 -right-2 rounded-full bg-destructive
                          p-1 text-white
                        "
                        aria-label={props.labels.referenceRemove}
                      >
                        <X className="size-3" />
                      </button>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label>{props.labels.referenceInfluenceLabel}</Label>
                      <div className="flex gap-2">
                        {(['low', 'medium', 'high'] as const).map(level => (
                          <button
                            key={level}
                            type="button"
                            onClick={() => setReferenceInfluence(level)}
                            className={cn(
                              'flex-1 rounded-md border px-2 py-1.5 text-xs',
                              referenceInfluence === level
                                ? `
                                  border-primary bg-primary
                                  text-primary-foreground
                                `
                                : 'border-input bg-transparent',
                            )}
                          >
                            {level === 'low' && props.labels.referenceInfluenceLow}
                            {level === 'medium' && props.labels.referenceInfluenceMedium}
                            {level === 'high' && props.labels.referenceInfluenceHigh}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {kind === 'wan' && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="imageUrl">{props.labels.imageUrlLabel}</Label>
                <Input
                  id="imageUrl"
                  required
                  type="url"
                  value={imageUrl}
                  onChange={e => setImageUrl(e.target.value)}
                  placeholder={props.labels.imageUrlPlaceholder}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="duration">{props.labels.durationLabel}</Label>
                <div className="flex gap-2">
                  {([5, 8, 10, 15] as const).map(seconds => (
                    <button
                      key={seconds}
                      type="button"
                      onClick={() => setDuration(seconds)}
                      className={cn(
                        'flex-1 rounded-md border px-2 py-1.5 text-sm',
                        duration === seconds
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-transparent',
                      )}
                    >
                      {seconds}
                      s
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? props.labels.submitting : props.labels.submit}
          </Button>

          <div className="text-center text-xs text-muted-foreground">
            {kind === 'flux' ? props.labels.costNoteImage : props.labels.costNoteVideo}
          </div>
        </form>
      </div>
    </div>
  );
};
