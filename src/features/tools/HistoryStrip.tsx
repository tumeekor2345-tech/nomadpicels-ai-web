'use client';

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useResolvePendingGenerations } from '@/features/generate/useResolvePendingGenerations';

type HistoryItem = {
  id: number;
  kind: string;
  jobId?: string | null;
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
  kind: 'photo_restore' | 'face_swap' | 'image_effect';
  title: string;
  emptyLabel: string;
  refreshKey: number;
  /**
   * Wider gallery-style grid (more, smaller-relative columns) instead of
   * the default narrow sidebar strip — added 2026-07-15 for Face Swap's
   * imagine.art-style full-width history section below the form.
   */
  wide?: boolean;
  // Added 2026-07-15 — history thumbnails used to be plain, unclickable
  // <img> tags with no way to see the full-size image or download it (the
  // download link only ever existed on the current "Үр дүн" result). Ports
  // the lightbox GenerateForm.tsx already has for the Create page's history
  // grid, so Photo Restore / Face Swap / Image Effect get the same
  // click-to-enlarge + download behavior.
  viewLabel: string;
  closeLabel: string;
  downloadLabel: string;
}) => {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<{ src: string; filename: string } | null>(null);

  // Un-sticks any generation still shown as IN_QUEUE/IN_PROGRESS here — see
  // useResolvePendingGenerations.ts for why that happens in the first place.
  useResolvePendingGenerations(items, setItems);

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
        <div className={props.wide
          ? `
            grid grid-cols-3 gap-3
            sm:grid-cols-4
            md:grid-cols-5
            lg:grid-cols-6
          `
          : `
            grid grid-cols-3 gap-2
            sm:grid-cols-4
          `}
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
                      <button
                        type="button"
                        onClick={() => setLightboxSrc({ src, filename: image?.filename ?? `${item.kind}-${item.id}.png` })}
                        aria-label={props.viewLabel}
                        className="group relative block size-full"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" className="size-full object-cover" />
                        <span className="
                          absolute inset-0 flex items-center justify-center
                          bg-black/0 text-xs font-medium text-transparent
                          transition-colors
                          group-hover:bg-black/40 group-hover:text-white
                        "
                        >
                          {props.viewLabel}
                        </span>
                      </button>
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

      {lightboxSrc && (
        <div
          className="
            fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6
          "
          onClick={() => setLightboxSrc(null)}
        >
          <div
            className="flex max-h-full max-w-full flex-col items-center gap-3"
            onClick={e => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxSrc.src}
              alt=""
              className="max-h-[80vh] max-w-full rounded-md object-contain"
            />
            <div className="flex items-center gap-4">
              <a
                href={lightboxSrc.src}
                download={lightboxSrc.filename}
                className="text-sm font-medium text-white underline"
              >
                {props.downloadLabel}
              </a>
              <button
                type="button"
                onClick={() => setLightboxSrc(null)}
                className="
                  flex items-center gap-1 text-sm font-medium text-white
                "
              >
                <X className="size-4" />
                {props.closeLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
