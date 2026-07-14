'use client';

import type {
  AspectRatioId,
  LensId,
  ReferenceInfluence,
  StyleId,
} from '@/libs/ImagePresets';
import type { FluxEngineId, NanoBanana2Resolution } from '@/libs/Pricing';
import { CheckIcon, ChevronDownIcon, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useResolvePendingGenerations } from '@/features/generate/useResolvePendingGenerations';
import {
  ASPECT_RATIOS,
  buildFinalPrompt,
  LENS_PRESETS,
  REFERENCE_INFLUENCE_DENOISE,
  STYLE_PRESETS,
} from '@/libs/ImagePresets';
import { cn } from '@/utils/Helpers';

type Kind = 'flux' | 'wan';

// Kept to these two fixed sizes for now (matches what the old RunPod Wan 2.2
// Hub endpoint supported) — fal.ai's Wan 2.7 (src/libs/Fal.ts buildFalWanInput)
// maps them to aspect_ratio '16:9'/'9:16', no other ratios wired up yet.
type WanAspectRatioId = '16:9' | '9:16';
const WAN_SIZES: Array<{ id: WanAspectRatioId; size: '1280*720' | '720*1280' }> = [
  { id: '16:9', size: '1280*720' },
  { id: '9:16', size: '720*1280' },
];

// "AI Image" engine selector — started as a 3-way choice added 2026-07-13,
// extended to 5 on 2026-07-15 (qwen_image, wan_t2i) — see src/libs/Pricing.ts
// (FLUX_ENGINE_CREDIT_COST) for the credit cost behind each option and
// src/libs/RunPod.ts for how each one actually gets called server-side.
const FLUX_ENGINES: FluxEngineId[] = ['runpod', 'fal_flux_dev', 'fal_nanobanana2', 'qwen_image', 'wan_t2i'];

// Resolution tiers for the Top-tier (Nano Banana 2) engine only — added
// 2026-07-15 at the user's request ("4K гэх захиалга өгч болох уу"). See
// NANOBANANA2_RESOLUTION_CREDIT_COST in src/libs/Pricing.ts for the credit
// cost behind each tier and buildRunPodNanoBanana2EditInput() in RunPod.ts
// for how it's actually passed to the endpoint. Only takes effect once a
// reference image is attached (that's when the real Nano Banana 2 Edit call
// happens) — ignored by every other engine and by the no-reference Flux Dev
// fallback.
const NANOBANANA2_RESOLUTIONS: NanoBanana2Resolution[] = ['1k', '2k', '4k'];

type JobStatus = {
  id: string;
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'TIMED_OUT';
  // Only set for fal.ai jobs (see src/libs/Fal.ts's FalJobStatus) while
  // status is IN_QUEUE — how many other requests are ahead in fal's shared
  // per-model queue. RunPod jobs never have this (dedicated pod, no queue to
  // report a position in), so it's always undefined there.
  queuePosition?: number;
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
  jobId?: string | null;
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
    // "{count}" placeholder gets replaced with the live queue_position from
    // fal.ai — see JobStatus.queuePosition above. Falls back to plain
    // `queued` when a job has no queue position to report (RunPod jobs, or
    // a fal job whose position fal hasn't reported yet).
    queuedWithPosition: string;
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
    engineLabel: string;
    engineNames: Record<FluxEngineId, string>;
    engineHints: Record<FluxEngineId, string>;
    resolutionLabel: string;
    resolutionHint: string;
    resolutionNames: Record<NanoBanana2Resolution, string>;
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
    enhanceButton: string;
    enhancing: string;
    enhancePreviewTitle: string;
    enhanceEnglishPreviewTitle: string;
    enhanceTranslating: string;
    enhanceUse: string;
    enhanceCancel: string;
    enhanceNotConfigured: string;
    enhanceFailed: string;
    enhanceBlocked: string;
    finalPromptTitle: string;
    finalPromptHint: string;
    finalPromptLoading: string;
    finalPromptRefresh: string;
    historyView: string;
    historyLightboxClose: string;
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
  const [wanAspectRatio, setWanAspectRatio] = useState<WanAspectRatioId>('16:9');
  // Default to "photorealistic" rather than "none": Flux schnell (the
  // model this app runs on) produces noticeably flatter, more
  // illustration-like results with a bare prompt — see
  // src/libs/ImagePresets.ts's honesty note. Defaulting to photorealistic
  // gives users a meaningfully better result out of the box; they can still
  // switch to "Байхгүй" or any other style manually.
  const [style, setStyle] = useState<StyleId>('photorealistic');
  const [engine, setEngine] = useState<FluxEngineId>('runpod');
  const [nanoBanana2Resolution, setNanoBanana2Resolution] = useState<NanoBanana2Resolution>('1k');
  const [lens, setLens] = useState<LensId>('none');
  const [aspectRatio, setAspectRatio] = useState<AspectRatioId>('1:1');
  const [referenceImage, setReferenceImage] = useState<{ dataUrl: string; base64: string } | null>(null);
  const [referenceInfluence, setReferenceInfluence] = useState<ReferenceInfluence>('medium');
  const referenceInputRef = useRef<HTMLInputElement | null>(null);
  const [enhancing, setEnhancing] = useState(false);
  const [enhancedMongolian, setEnhancedMongolian] = useState<string | null>(null);
  const [englishPreview, setEnglishPreview] = useState<string | null>(null);
  const [translatingPreview, setTranslatingPreview] = useState(false);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [images, setImages] = useState<Array<{ filename: string; type: string; data: string }>>([]);
  const [rawOutput, setRawOutput] = useState<Record<string, unknown> | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Un-sticks any generation still shown as IN_QUEUE/IN_PROGRESS in this
  // list (e.g. one submitted from a different tab/session, or one whose
  // original polling stopped because the user navigated away — see
  // useResolvePendingGenerations.ts for the full story).
  useResolvePendingGenerations(history, setHistory);

  // Lightbox for the history grid — added 2026-07-10. The history thumbnails
  // used to be plain, unclickable <img>/<video> tags with no way to see the
  // full-size image or download it (the download link only ever existed on
  // the current "Үр дүн" result, not on past history items). Clicking a
  // history image opens it full-size here, with its own download link.
  const [lightboxImage, setLightboxImage] = useState<{ src: string; filename: string; caption: string } | null>(null);

  // "Эцсийн Prompt" — stage 3 of the 4-stage pipeline in
  // src/libs/PromptPipeline.ts, exposed 2026-07-09 so the user can see (and
  // edit) the exact English text that will reach Flux/Wan, instead of the
  // translation + ethnicity/composition reinforcement happening invisibly
  // server-side. Auto-refreshes (debounced) whenever the source prompt/style/
  // lens changes, UNLESS the user has hand-edited the box — editing it stops
  // auto-refresh from clobbering their edit until they explicitly click
  // "Шинэчлэх". Whatever is in this box at submit time is sent as
  // `finalPromptOverride` and used as-is server-side.
  const [finalPrompt, setFinalPrompt] = useState('');
  const [finalPromptLoading, setFinalPromptLoading] = useState(false);
  const [finalPromptEdited, setFinalPromptEdited] = useState(false);
  const finalPromptDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sourcePromptForPreview = kind === 'flux' ? buildFinalPrompt(prompt, style, lens) : prompt;

  const fetchFinalPromptPreview = async (source: string) => {
    if (!source.trim()) {
      setFinalPrompt('');
      return;
    }

    setFinalPromptLoading(true);

    try {
      const res = await fetch('/api/generate/preview-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: source }),
      });
      const data = await res.json();

      if (res.ok && typeof data.finalPrompt === 'string') {
        setFinalPrompt(data.finalPrompt);
      }
    } catch {
      // Silent — the box just keeps showing the last known value. Submit
      // still works without a fresh preview (server recomputes it anyway
      // when finalPromptOverride is empty).
    } finally {
      setFinalPromptLoading(false);
    }
  };

  useEffect(() => {
    if (finalPromptEdited) {
      return;
    }

    if (finalPromptDebounce.current) {
      clearTimeout(finalPromptDebounce.current);
    }

    finalPromptDebounce.current = setTimeout(() => {
      fetchFinalPromptPreview(sourcePromptForPreview);
    }, 600);

    return () => {
      if (finalPromptDebounce.current) {
        clearTimeout(finalPromptDebounce.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcePromptForPreview, finalPromptEdited]);

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

    const res = await fetch(`/api/generate/status?kind=${jobKind}&jobId=${encodeURIComponent(jobId)}`);
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

    if (data.status === 'IN_QUEUE') {
      setStatusText(
        typeof data.queuePosition === 'number'
          ? props.labels.queuedWithPosition.replace('{count}', String(data.queuePosition))
          : props.labels.queued,
      );
    } else {
      setStatusText(props.labels.inProgress);
    }
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

    // Whatever is currently in the "Эцсийн Prompt" box (stage 3 — see
    // src/libs/PromptPipeline.ts) is sent as finalPromptOverride, so the
    // server uses it as-is instead of recomputing translate+reinforce. This
    // is what makes the exposed box actually control generation, not just
    // display info.
    const body = kind === 'flux'
      ? {
          kind,
          engine,
          prompt: buildFinalPrompt(prompt, style, lens),
          finalPromptOverride: finalPrompt,
          width: ASPECT_RATIOS.find(r => r.id === aspectRatio)?.width,
          height: ASPECT_RATIOS.find(r => r.id === aspectRatio)?.height,
          // Only meaningful for the Top-tier (Nano Banana 2) engine WITH a
          // reference image attached — the server ignores it otherwise (see
          // /api/generate/route.ts's usingNanoBanana2 check), but there's no
          // harm sending it unconditionally.
          resolution: nanoBanana2Resolution,
          ...(referenceImage
            ? {
                referenceImageBase64: referenceImage.base64,
                denoise: REFERENCE_INFLUENCE_DENOISE[referenceInfluence],
              }
            : {}),
        }
      : {
          kind,
          prompt,
          finalPromptOverride: finalPrompt,
          imageUrl,
          durationSeconds: duration,
          size: WAN_SIZES.find(r => r.id === wanAspectRatio)?.size,
        };

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

  const handleEnhance = async () => {
    if (!prompt.trim() || enhancing) {
      return;
    }

    setEnhancing(true);
    setEnhanceError(null);
    setEnhancedMongolian(null);
    setEnglishPreview(null);

    try {
      const res = await fetch('/api/generate/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, kind }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'not_configured') {
          setEnhanceError(props.labels.enhanceNotConfigured);
        } else if (data.error === 'prompt_blocked') {
          setEnhanceError(props.labels.enhanceBlocked);
        } else {
          setEnhanceError(props.labels.enhanceFailed);
        }
        return;
      }

      setEnhancedMongolian(data.enhancedPrompt);
      setEnglishPreview(data.englishPreview);
    } catch {
      setEnhanceError(props.labels.enhanceFailed);
    } finally {
      setEnhancing(false);
    }
  };

  // Called when the user finishes editing the Mongolian enhanced-idea box
  // (onBlur) — refreshes the read-only English translation preview next to
  // it. Deliberately a plain translation call, not another full Claude
  // enhancement (see src/app/api/generate/translate-prompt/route.ts).
  const handlePreviewBlur = async () => {
    if (!enhancedMongolian || !enhancedMongolian.trim()) {
      return;
    }

    setTranslatingPreview(true);

    try {
      const res = await fetch('/api/generate/translate-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: enhancedMongolian }),
      });
      const data = await res.json();

      if (res.ok) {
        setEnglishPreview(data.translated);
      }
    } catch {
      // Keep the previous preview on failure — not worth surfacing an error
      // for a background refresh.
    } finally {
      setTranslatingPreview(false);
    }
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
                      {item.images?.[0] && (() => {
                        const firstImage = item.images[0];
                        const src = firstImage.type === 'base64'
                          ? `data:image/png;base64,${firstImage.data}`
                          : firstImage.data;
                        return (
                          <button
                            type="button"
                            onClick={() => setLightboxImage({
                              src,
                              filename: firstImage.filename,
                              caption: item.prompt,
                            })}
                            className="group relative block overflow-hidden rounded-md"
                            aria-label={props.labels.historyView}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={src}
                              alt={item.prompt}
                              className="aspect-square rounded-md object-cover"
                            />
                            <span className="
                              absolute inset-0 flex items-center justify-center
                              bg-black/0 text-xs font-medium text-transparent
                              transition-colors
                              group-hover:bg-black/40 group-hover:text-white
                            "
                            >
                              {props.labels.historyView}
                            </span>
                          </button>
                        );
                      })()}
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
          {/* Engine (загвар) dropdown — moved to the very top of the panel
              2026-07-14 so it's the first decision the user makes, and
              collapsed into a single-line dropdown (was a tall stacked list
              of buttons) so picking a model doesn't push the rest of the
              form down. Shows a checkmark (CheckIcon) next to whichever
              engine is currently selected, matching the "хураагдсан ...
              чек хийдэг" request. */}
          {kind === 'flux' && (
            <div className="flex flex-col gap-1.5">
              <Label>{props.labels.engineLabel}</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="
                      flex w-full items-center justify-between rounded-md
                      border border-input bg-transparent px-3 py-2 text-sm
                    "
                  >
                    <span className="flex flex-col items-start text-left">
                      <span className="font-medium">{props.labels.engineNames[engine]}</span>
                      <span className="text-xs text-muted-foreground">{props.labels.engineHints[engine]}</span>
                    </span>
                    <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-(--radix-dropdown-menu-trigger-width)"
                >
                  {FLUX_ENGINES.map(engineId => (
                    <DropdownMenuItem
                      key={engineId}
                      onSelect={() => setEngine(engineId)}
                    >
                      <CheckIcon
                        className={cn(
                          'size-4 shrink-0',
                          engine === engineId ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <span className="flex flex-col">
                        <span className="font-medium">{props.labels.engineNames[engineId]}</span>
                        <span className="text-xs text-muted-foreground">{props.labels.engineHints[engineId]}</span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {/* Resolution (1K/2K/4K) — Top-tier (Nano Banana 2) only. Added
              2026-07-15. Kept as small chip buttons (like Aspect ratio) rather
              than another dropdown since there are only 3 options and the
              credit cost difference between them is the whole point of
              showing them side by side. */}
          {kind === 'flux' && engine === 'fal_nanobanana2' && (
            <div className="flex flex-col gap-1.5">
              <Label>{props.labels.resolutionLabel}</Label>
              <div className="flex gap-2">
                {NANOBANANA2_RESOLUTIONS.map(res => (
                  <button
                    key={res}
                    type="button"
                    onClick={() => setNanoBanana2Resolution(res)}
                    className={cn(
                      'flex-1 rounded-md border px-2 py-1.5 text-xs font-medium',
                      nanoBanana2Resolution === res
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-transparent text-muted-foreground',
                    )}
                  >
                    {props.labels.resolutionNames[res]}
                  </button>
                ))}
              </div>
              <div className="text-xs text-muted-foreground">{props.labels.resolutionHint}</div>
            </div>
          )}

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

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!prompt.trim() || enhancing}
              onClick={handleEnhance}
              className="self-start"
            >
              {enhancing ? props.labels.enhancing : props.labels.enhanceButton}
            </Button>

            {enhanceError && (
              <div className="text-xs font-medium text-destructive">{enhanceError}</div>
            )}

            {enhancedMongolian !== null && (
              <div className="
                flex flex-col gap-3 rounded-md border border-input bg-muted p-3
              "
              >
                <div className="flex flex-col gap-1.5">
                  <div className="text-xs font-semibold">{props.labels.enhancePreviewTitle}</div>
                  <Textarea
                    value={enhancedMongolian}
                    onChange={e => setEnhancedMongolian(e.target.value)}
                    onBlur={handlePreviewBlur}
                    rows={4}
                    className="bg-background"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="text-xs font-semibold">{props.labels.enhanceEnglishPreviewTitle}</div>
                  <div className="
                    rounded-md bg-background p-2 text-sm text-muted-foreground
                  "
                  >
                    {translatingPreview ? props.labels.enhanceTranslating : englishPreview}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setPrompt(enhancedMongolian);
                      setEnhancedMongolian(null);
                      setEnglishPreview(null);
                    }}
                  >
                    {props.labels.enhanceUse}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEnhancedMongolian(null);
                      setEnglishPreview(null);
                    }}
                  >
                    {props.labels.enhanceCancel}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="
            flex flex-col gap-1.5 rounded-md border border-input bg-muted p-3
          "
          >
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="finalPrompt" className="text-xs font-semibold">
                {props.labels.finalPromptTitle}
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setFinalPromptEdited(false);
                  fetchFinalPromptPreview(sourcePromptForPreview);
                }}
              >
                {props.labels.finalPromptRefresh}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">{props.labels.finalPromptHint}</div>
            <Textarea
              id="finalPrompt"
              value={finalPromptLoading ? props.labels.finalPromptLoading : finalPrompt}
              disabled={finalPromptLoading}
              onChange={(e) => {
                setFinalPrompt(e.target.value);
                setFinalPromptEdited(true);
              }}
              rows={4}
              className="bg-background text-xs"
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
                <Label>{props.labels.aspectRatioLabel}</Label>
                <div className="flex gap-2">
                  {WAN_SIZES.map(ratio => (
                    <button
                      key={ratio.id}
                      type="button"
                      onClick={() => setWanAspectRatio(ratio.id)}
                      className={cn(
                        `
                          flex-1 rounded-md border px-2 py-1.5 text-sm
                          font-medium
                        `,
                        wanAspectRatio === ratio.id
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

      {/* History lightbox — see the lightboxImage state comment above. Fixed
          overlay so it works regardless of where it sits in the DOM tree. */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="flex max-h-full max-w-full flex-col items-center gap-3"
            onClick={e => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxImage.src}
              alt={lightboxImage.caption}
              className="max-h-[80vh] max-w-full rounded-md object-contain"
            />
            <div className="flex items-center gap-4">
              <a
                href={lightboxImage.src}
                download={lightboxImage.filename}
                className="text-sm font-medium text-white underline"
              >
                {props.labels.downloadLabel}
              </a>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="
                  flex items-center gap-1 text-sm font-medium text-white
                "
              >
                <X className="size-4" />
                {props.labels.historyLightboxClose}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
