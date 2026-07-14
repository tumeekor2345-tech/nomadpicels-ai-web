'use client';

import type { FaceSwapStyleId } from '@/libs/FaceSwapStyles';
import type { ChangeEvent } from 'react';
import { X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DEFAULT_FACE_SWAP_STYLE, FACE_SWAP_STYLE_IDS, FACE_SWAP_STYLE_IMAGES } from '@/libs/FaceSwapStyles';
import { cn } from '@/utils/Helpers';
import { HistoryStrip } from './HistoryStrip';

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

type Labels = {
  styleLabel: string;
  styleLabels: Record<FaceSwapStyleId, string>;
  imageUrlLabel: string;
  imageUrlPlaceholder: string;
  // Added 2026-07-15 — the tool only ever had a "paste a URL" text field
  // (imageUrlLabel above), which meant a user had to already have their
  // photo hosted somewhere public before they could use it at all. Per the
  // user's feedback ("гол нь би зургаа оруулж болохгүй байна" — the whole
  // point is I can't upload my own photo), added a real file-upload button.
  // First attempt sent the file as an embedded base64 data: URI straight
  // through as `image_url` (mirroring GenerateForm.tsx's reference-image
  // upload) — but RunPod's comfyui-faceswap-sdxl endpoint sits behind a WAF
  // that blocks requests carrying a large embedded data: URI ("[BLOCKED:
  // Cookie/query string data]"), so jobs completed with no image. Fixed by
  // POSTing the file to /api/uploads first (stores it, returns a real
  // https:// URL on our own domain), then sending THAT URL as imageUrl —
  // see src/app/api/uploads/route.ts.
  uploadLabel: string;
  uploadButton: string;
  uploadRemove: string;
  uploadOrUrlDivider: string;
  uploadFailed: string;
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

export const FaceSwapWorkspace = (props: { labels: Labels }) => {
  const { labels } = props;
  const [style, setStyle] = useState<FaceSwapStyleId>(DEFAULT_FACE_SWAP_STYLE);
  const [imageUrl, setImageUrl] = useState('');
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
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
      if (data.output?.image_base64) {
        setResultSrc(`data:image/png;base64,${data.output.image_base64}`);
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

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) {
      return;
    }

    setErrorText(null);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setUploadedPreview(dataUrl);
      setUploading(true);
      try {
        const res = await fetch('/api/uploads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl }),
        });
        const data = await res.json();
        if (!res.ok || !data.url) {
          throw new Error(data.error ?? 'upload failed');
        }
        setImageUrl(data.url);
      } catch {
        setErrorText(labels.uploadFailed);
        setUploadedPreview(null);
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const clearUpload = () => {
    setUploadedPreview(null);
    setImageUrl('');
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
      body: JSON.stringify({ kind: 'face_swap', imageUrl, style }),
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
          <Label>{labels.styleLabel}</Label>
          <div className="grid grid-cols-2 gap-2">
            {FACE_SWAP_STYLE_IDS.map(id => (
              <button
                key={id}
                type="button"
                onClick={() => setStyle(id)}
                className={cn(
                  `
                    flex flex-col overflow-hidden rounded-md border-2 text-left
                    transition-colors
                  `,
                  style === id ? 'border-primary' : 'border-transparent',
                )}
              >
                <div className="aspect-square w-full overflow-hidden bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={FACE_SWAP_STYLE_IMAGES[id]}
                    alt={labels.styleLabels[id]}
                    className="size-full object-cover"
                  />
                </div>
                <div className={cn(
                  'px-1.5 py-1 text-xs font-medium',
                  style === id
                    ? 'bg-primary text-primary-foreground'
                    : `bg-muted`,
                )}
                >
                  {labels.styleLabels[id]}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>{labels.uploadLabel}</Label>
          {uploadedPreview
            ? (
                <div className="relative w-fit">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={uploadedPreview}
                    alt=""
                    className="h-28 w-28 rounded-md object-cover"
                  />
                  {!uploading && (
                    <button
                      type="button"
                      onClick={clearUpload}
                      aria-label={labels.uploadRemove}
                      className="
                        absolute -right-2 -top-2 flex size-6 items-center
                        justify-center rounded-full bg-destructive
                        text-destructive-foreground
                      "
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                  {uploading && (
                    <div className="
                      absolute inset-0 flex items-center justify-center
                      rounded-md bg-black/40 text-[10px] text-white
                    "
                    >
                      ...
                    </div>
                  )}
                </div>
              )
            : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => uploadInputRef.current?.click()}
                >
                  {labels.uploadButton}
                </Button>
              )}
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {!uploadedPreview && (
          <div className="flex flex-col gap-1.5">
            <div className="text-xs text-muted-foreground">{labels.uploadOrUrlDivider}</div>
            <Label htmlFor="face-swap-url">{labels.imageUrlLabel}</Label>
            <Input
              id="face-swap-url"
              type="url"
              value={imageUrl}
              onChange={e => setImageUrl(e.target.value)}
              placeholder={labels.imageUrlPlaceholder}
            />
          </div>
        )}

        <Button type="button" disabled={submitting || uploading || !imageUrl} onClick={handleRun}>
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
                    download="face-swap.png"
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
          kind="face_swap"
          title={labels.historyTitle}
          emptyLabel={labels.historyEmpty}
          refreshKey={historyKey}
        />
      </div>
    </div>
  );
};
