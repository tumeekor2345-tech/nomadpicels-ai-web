'use client';

import { useEffect, useState } from 'react';
import { useResolvePendingGenerations } from '@/features/generate/useResolvePendingGenerations';

type HistoryItem = {
  id: number;
  kind: string;
  jobId?: string | null;
  prompt: string;
  status: string;
  images?: Array<{ filename: string; type: string; data: string }>;
  videoUrl?: string;
  createdAt: string;
};

const KIND_LABELS: Record<string, string> = {
  flux: 'Flux',
  wan: 'Wan 2.2',
  photo_restore: 'Photo Restore',
  face_swap: 'Face Swap',
};

export const RecentCreations = (props: {
  title: string;
  emptyLabel: string;
}) => {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Un-sticks any generation still shown as IN_QUEUE/IN_PROGRESS here — see
  // useResolvePendingGenerations.ts for why that happens in the first place.
  useResolvePendingGenerations(items, setItems);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/generate/history')
      .then(res => res.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data.items)) {
          setItems(data.items);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mt-10">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{props.title}</h2>
      </div>

      {loaded && items.length === 0 && (
        <div className="
          rounded-md border border-dashed border-border bg-card p-8 text-center
          text-sm text-muted-foreground
        "
        >
          {props.emptyLabel}
        </div>
      )}

      {items.length > 0 && (
        <div className="
          grid grid-cols-2 gap-4
          sm:grid-cols-3
          lg:grid-cols-5
        "
        >
          {items.map((item) => {
            const thumb = item.images?.[0]
              ? (item.images[0].type === 'base64'
                  ? `data:image/png;base64,${item.images[0].data}`
                  : item.images[0].data)
              : null;

            return (
              <div
                key={`${item.kind}-${item.id}`}
                className="group overflow-hidden rounded-md bg-card"
              >
                <div className="aspect-square bg-muted">
                  {thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt={item.prompt}
                      className="size-full object-cover"
                    />
                  )}
                  {!thumb && item.videoUrl && (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video
                      src={item.videoUrl}
                      className="size-full object-cover"
                    />
                  )}
                  {!thumb && !item.videoUrl && (
                    <div className="
                      flex size-full items-center justify-center text-xs
                      text-muted-foreground
                    "
                    >
                      {item.status}
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    {KIND_LABELS[item.kind] ?? item.kind}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
