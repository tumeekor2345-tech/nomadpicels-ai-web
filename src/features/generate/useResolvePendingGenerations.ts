import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useRef } from 'react';

type PendingCapableItem = {
  id: number;
  kind: string;
  jobId?: string | null;
  status: string;
  images?: Array<{ filename: string; type: string; data: string }>;
  videoUrl?: string;
};

const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT']);
const POLL_INTERVAL_MS = 4000;
// 2026-07-13 cost-safety fix: this hook used to re-poll every non-terminal
// item forever, with no cap — discovered live that a handful of test jobs
// from earlier in the day were still sitting IN_QUEUE and getting hit every
// 4s, indefinitely, for as long as any page listing history was open. Each
// poll calls fal.ai's status API (see src/libs/Fal.ts's getFalJobStatus),
// and fal.ai's real billing (checked on the fal.ai dashboard) turned out to
// be several times higher per job than the flat per-megapixel rate would
// predict — an indefinite poll loop against a job that's stuck/dead on fal's
// side is the most likely multiplier. Capping how many times any single
// jobId gets polled here bounds the worst case regardless of the exact fal
// billing mechanism, while still giving a healthy job (which finishes in
// well under this window) plenty of chances to resolve.
const MAX_POLL_ATTEMPTS = 40; // ~2.5 minutes at 4s/attempt

/**
 * Why this exists: a generation job is only actively polled by the
 * GenerateForm instance that originally submitted it (see `pollStatus` in
 * GenerateForm.tsx). If the user navigates to another menu/tab before that
 * job finishes — very easy to do, since fal.ai's queue can take a while, see
 * src/libs/Fal.ts — nothing ever checks that job's status again. The DB row
 * (and every history/gallery view built from it: GenerateForm's own list,
 * RecentCreations on Home, HistoryStrip on the Tools pages) stays frozen at
 * IN_QUEUE forever, even though the job may have completed on fal.ai's/
 * RunPod's side minutes ago. This is the "generated image gets stuck /
 * doesn't show up when switching menus" bug.
 *
 * Fix: any history list that renders generations should call this hook with
 * its own `items`/`setItems` state. It finds items still sitting in a
 * non-terminal status, re-checks each one's real status via the existing
 * /api/generate/status endpoint (same one GenerateForm uses), and patches
 * the item in place once it resolves — so the moment you look at a screen
 * that lists a pending generation, it un-sticks itself instead of staying
 * blank forever.
 */
export function useResolvePendingGenerations<T extends PendingCapableItem>(
  items: T[],
  setItems: Dispatch<SetStateAction<T[]>>,
) {
  const inFlight = useRef<Set<string>>(new Set());
  const attemptCounts = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const pending = items.filter(
      item =>
        item.jobId
        && !TERMINAL_STATUSES.has(item.status)
        && !inFlight.current.has(item.jobId)
        && (attemptCounts.current.get(item.jobId) ?? 0) < MAX_POLL_ATTEMPTS,
    );

    if (pending.length === 0) {
      return;
    }

    const timer = setTimeout(() => {
      pending.forEach((item) => {
        const jobId = item.jobId!;
        inFlight.current.add(jobId);
        attemptCounts.current.set(jobId, (attemptCounts.current.get(jobId) ?? 0) + 1);

        fetch(`/api/generate/status?kind=${item.kind}&jobId=${encodeURIComponent(jobId)}`)
          .then(res => res.json().then(data => ({ ok: res.ok, data })))
          .then(({ ok, data }) => {
            if (!ok) {
              return;
            }

            setItems(prev => prev.map((p) => {
              if (p.id !== item.id) {
                return p;
              }

              if (data.status === 'COMPLETED') {
                return {
                  ...p,
                  status: data.status,
                  images: data.output?.images ?? p.images,
                  videoUrl: typeof data.output?.result === 'string' ? data.output.result : p.videoUrl,
                };
              }

              return { ...p, status: data.status ?? p.status };
            }));
          })
          .catch(() => {
            // Will simply retry on the next tick.
          })
          .finally(() => {
            inFlight.current.delete(jobId);
          });
      });
    }, POLL_INTERVAL_MS);

    return () => clearTimeout(timer);
  }, [items, setItems]);
}
