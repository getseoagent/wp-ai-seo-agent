import type { WpClient, PostSummary } from "./wp-client";
import type { CraftDeps } from "./craft";
import { CraftError } from "./craft";
import type { SseEvent } from "./sse";

const CONCURRENCY = 3;
const POLL_DEBOUNCE_MS = 1000;

export type RunBulkJobArgs = {
  jobId: string;
  postIds: number[];
  styleHints: string;
  wp: WpClient;
  craft: CraftDeps;
  signal: AbortSignal;
  emit: (ev: SseEvent) => void;
  pollDebounceMs?: number;
};

export type BulkPostResult = {
  post_id: number;
  status: "applied" | "failed" | "skipped";
  history_id?: number;
  reason?: string;
  title_before?: string | null;
  title_after?: string;
};

export type BulkApplyResult = {
  job_id: string;
  status: "completed" | "cancelled" | "failed";
  total: number;
  applied: number;
  failed: number;
  skipped: number;
  duration_ms: number;
  results: BulkPostResult[];
};

export async function runBulkJob(args: RunBulkJobArgs): Promise<BulkApplyResult> {
  const { jobId, postIds, styleHints, wp, craft, emit } = args;
  const startedAt = Date.now();
  const total = postIds.length;
  const queue = [...postIds];
  const results: BulkPostResult[] = [];

  // Inner controller for cancel-poll triggered abort, listening to outer signal too.
  const innerAc = new AbortController();
  const onOuterAbort = () => innerAc.abort();
  args.signal.addEventListener("abort", onOuterAbort);
  const innerSignal = innerAc.signal;

  let applied = 0;
  let failed = 0;
  let skipped = 0;
  let cancelled = false;
  let lastPollAt = 0;
  const pollLock = { busy: false };

  async function pollCancel(): Promise<void> {
    if (innerSignal.aborted) return;
    const debounce = args.pollDebounceMs ?? POLL_DEBOUNCE_MS;
    const now = Date.now();
    if (now - lastPollAt < debounce) return;
    if (pollLock.busy) return;
    pollLock.busy = true;
    lastPollAt = now;
    try {
      const job = await wp.getJob(jobId);
      if (job?.cancel_requested_at) {
        cancelled = true;
        innerAc.abort();
      }
    } catch {
      /* ignore poll failure; try again next iteration */
    } finally {
      pollLock.busy = false;
    }
  }

  async function emitProgress(currentPost?: { id: number; title: string }): Promise<void> {
    emit({
      type: "bulk_progress",
      job_id: jobId, done: applied, total, failed,
      current_post_id: currentPost?.id,
      current_post_title: currentPost?.title,
    });
    try {
      await wp.updateJobProgress(jobId, applied, failed);
    } catch {
      /* progress write failures are non-fatal */
    }
  }

  async function processOne(postId: number): Promise<void> {
    if (innerSignal.aborted) {
      results.push({ post_id: postId, status: "skipped", reason: "cancelled" });
      skipped++;
      return;
    }
    let summary: PostSummary | null;
    try {
      summary = await wp.getPostSummary(postId, innerSignal);
    } catch (err) {
      if (innerSignal.aborted) {
        results.push({ post_id: postId, status: "skipped", reason: "cancelled" });
        skipped++;
        return;
      }
      results.push({ post_id: postId, status: "failed", reason: err instanceof Error ? err.message : String(err) });
      failed++;
      // No emitProgress here: getPostSummary failure means we have no title to surface.
      // Counter is updated; client will see the change on the next worker's emitProgress.
      return;
    }
    if (summary === null) {
      results.push({ post_id: postId, status: "skipped", reason: "post_not_found" });
      skipped++;
      await emitProgress({ id: postId, title: "(unknown)" });
      return;
    }
    let proposal;
    try {
      proposal = await craft.composeRewrite(summary, styleHints || undefined, innerSignal);
    } catch (err) {
      if (innerSignal.aborted) {
        results.push({ post_id: postId, status: "skipped", reason: "cancelled" });
        skipped++;
        return;
      }
      const msg = err instanceof CraftError ? `${err.reason}: ${err.detail}` : String(err);
      results.push({ post_id: postId, status: "failed", reason: msg });
      failed++;
      await emitProgress({ id: postId, title: summary.post_title });
      return;
    }
    const fields = {
      title: proposal.title.new,
      description: proposal.description.new,
      focus_keyword: proposal.focus_keyword.new,
    };
    try {
      const updateResult = await wp.updateSeoFields(postId, fields, jobId, innerSignal);
      const titleResult = updateResult.results.find((r: any) => r.field === "title");
      results.push({
        post_id: postId,
        status: "applied",
        history_id: undefined,  // updateResult doesn't expose this in current Plan 3a shape
        title_before: titleResult?.before ?? null,
        title_after: titleResult?.after,
      });
      applied++;
    } catch (err) {
      if (innerSignal.aborted) {
        results.push({ post_id: postId, status: "skipped", reason: "cancelled" });
        skipped++;
        return;
      }
      results.push({ post_id: postId, status: "failed", reason: err instanceof Error ? err.message : String(err) });
      failed++;
    }
    await emitProgress({ id: postId, title: summary.post_title });
  }

  async function worker(): Promise<void> {
    while (true) {
      if (innerSignal.aborted) return;
      await pollCancel();
      if (cancelled || innerSignal.aborted) return;
      const next = queue.shift();
      if (next === undefined) return;
      await processOne(next);
    }
  }

  try {
    await Promise.allSettled(Array.from({ length: CONCURRENCY }, () => worker()));

    // Drain remaining queue as skipped (cancellation case)
    while (queue.length > 0) {
      const id = queue.shift()!;
      results.push({ post_id: id, status: "skipped", reason: "cancelled" });
      skipped++;
    }
  } finally {
    args.signal.removeEventListener("abort", onOuterAbort);
  }

  const status: BulkApplyResult["status"] = cancelled || args.signal.aborted ? "cancelled" : "completed";

  try {
    await wp.markJobDone(jobId, status);
  } catch {
    /* swallow — caller can still observe via DB */
  }

  return {
    job_id: jobId,
    status,
    total,
    applied,
    failed,
    skipped,
    duration_ms: Date.now() - startedAt,
    results,
  };
}
