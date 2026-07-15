/**
 * fal.ai job-id helper — kept as a tiny stub after fal.ai was fully replaced
 * by RunPod Hub Public Endpoints (see src/libs/RunPod.ts). The rest of the
 * fal.ai REST client (submit/status/result, Flux Dev, Nano Banana 2, Wan 2.7
 * builders) was deleted 2026-07-15 as dead code — nothing calls it anymore.
 *
 * `isFalJobId` is still needed by /api/generate/status/route.ts, which must
 * recognize legacy `fal::`-prefixed job ids stored in generationSchema.jobId
 * from before the RunPod migration and return a FAILED status for them
 * (fal.ai is no longer reachable/billed, so those old jobs can't be polled).
 */

const FAL_JOB_ID_PREFIX = 'fal::';

export function isFalJobId(jobId: string): boolean {
  return jobId.startsWith(FAL_JOB_ID_PREFIX);
}
