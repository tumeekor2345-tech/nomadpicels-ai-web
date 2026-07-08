'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { HistoryStrip } from './HistoryStrip';

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

type Labels = {
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

export const PhotoRestoreWorkspace = (props: { labels: Labels }) => {
  const { labels } = props;
  const [imageUrl, setImageUrl] = useState('');
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
      body: JSON.stringify({ kind: 'photo_restore', imageUrl }),
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
      <div className="flex flex-col gap-4 rounded-md bg-card p-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="photo-restore-url">{labels.imageUrlLabel}</Label>
          <Input
            id="photo-restore-url"
            type="url"
            required
            value={imageUrl}
            onChange={e => setImageUrl(e.target.value)}
            placeholder={labels.imageUrlPlaceholder}
          />
        </div>

        <Button type="button" disabled={submitting || !imageUrl} onClick={handleRun}>
          {submitting ? labels.running : labels.run}
        </Button>

        {statusText && <div className="text-sm text-muted-foreground">{statusText}</div>}
        {errorText && <div className="text-sm font-medium text-destructive">{errorText}</div>}
      </div>

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
                    download="photo-restore.png"
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
          kind="photo_restore"
          title={labels.historyTitle}
          emptyLabel={labels.historyEmpty}
          refreshKey={historyKey}
        />
      </div>
    </div>
  );
};
