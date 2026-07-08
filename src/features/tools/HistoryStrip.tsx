'use client';

import { useEffect, useState } from 'react';

type HistoryItem = {
  id: number;
  kind: string;
  status: string;
  images?: Array<{ filename: string; type: string; data: string }>;
  createdAt: string;
};

/**
 * Renders the last N generations of a single `kind` as a thumbnail grid —
 * used as the history sidebar on each dedicated Tools workspace page.
 * `refreshKey` should change (e.g. increment) whenever a new generation
 * completes, so the strip re-fetches and shows the new item.
 */
export const HistoryStrip = (props: {
  kind: 'photo_restore' | 'face_swap';
  title: string;
  emptyLabel: string;
  refreshKey: number;
}) => {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/generate/history?kind=${props.kind}`)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.kind, props.refreshKey]);

  return (
    <div className="flex flex-col gap-3 rounded-md bg-card p-5">
      <div className="text-sm font-semibold">{props.title}</div>

      {loaded && items.length === 0 && (
        <div className="text-sm text-muted-foreground">{props.emptyLabel}</div>
      )}

      {items.length > 0 && (
        <div className="
          grid grid-cols-3 gap-2
          sm:grid-cols-4
        "
        >
          {items.map((item) => {
            const image = item.images?.[0];
            const src = image
              ? (image.type === 'base64' ? `data:image/png;base64,${image.data}` : image.data)
              : null;

            return (
              <div
                key={item.id}
                className="aspect-square overflow-hidden rounded-md bg-muted"
              >
                {src
                  ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt="" className="size-full object-cover" />
                    )
                  : (
                      <div className="
                        flex size-full items-center justify-center text-[10px]
                        text-muted-foreground
                      "
                      >
                        {item.status}
                      </div>
                    )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
