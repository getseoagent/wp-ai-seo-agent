import type { Job } from "../hooks/useJobPolling";
import { __, sprintf } from "../lib/i18n";

export type FormattedBulkSummary = {
  mode: "apply" | "rollback";
  jobId: string;
  headline: string;
  statusBadge: string;
  rows: Array<{
    label: string;
    status: string;
    detail?: string;
  }>;
  canRollback: boolean;
};

/**
 * Plan 4-B: produce a summary from a polling-derived Job (no per-post rows).
 * Used when the agent's apply_style_to_batch tool returned {status:"running"}
 * and the actual job state arrived via useJobPolling. Per-post rows would
 * require a /history?job_id=X fetch — deferred for v0.6.0; the headline +
 * status badge + total counts are enough for v1.
 */
export function formatBulkSummaryFromJob(job: Job): FormattedBulkSummary {
  const succeeded = job.done;
  const failed = job.failed_count;
  return {
    mode: "apply",
    jobId: job.id,
    // Translators: %1$d = applied, %2$d = failed, %3$d = total
    headline: sprintf(__("Applied %1$d / Failed %2$d / Total %3$d"), succeeded, failed, job.total),
    statusBadge: job.status,
    rows: [],
    canRollback: succeeded > 0 && job.status === "completed",
  };
}

type ApplyInput = {
  job_id: string;
  status: "completed" | "cancelled" | "failed";
  total: number;
  applied: number;
  failed: number;
  skipped: number;
  duration_ms: number;
  results: Array<{
    post_id: number;
    status: "applied" | "failed" | "skipped";
    history_id?: number;
    reason?: string;
    title_before?: string | null;
    title_after?: string;
  }>;
};

type RollbackInput = {
  job_id: string;
  results: Array<{
    history_id: number;
    status: string;
    reason?: string;
  }>;
};

function isApplyInput(x: unknown): x is ApplyInput {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.applied === "number" && Array.isArray(o.results);
}

export function formatBulkSummary(input: unknown): FormattedBulkSummary {
  if (isApplyInput(input)) {
    return {
      mode: "apply",
      jobId: input.job_id,
      // Translators: %1$d = applied, %2$d = failed, %3$d = skipped
      headline: sprintf(__("Applied %1$d / Failed %2$d / Skipped %3$d"), input.applied, input.failed, input.skipped),
      statusBadge: input.status,
      rows: input.results.map(r => ({
        // Translators: %d = post ID
        label: sprintf(__("Post %d"), r.post_id),
        status: r.status,
        detail: r.status === "applied"
          ? `${r.title_before ?? __("(no title)")} → ${r.title_after}`
          : r.reason,
      })),
      canRollback: input.applied > 0 && input.status !== "failed",
    };
  }
  // rollback mode
  const r = input as RollbackInput;
  const results = r.results ?? [];
  const rolled = results.filter(x => x.status === "rolled_back").length;
  const skipped = results.filter(x => x.status !== "rolled_back").length;
  // Translators: %d = number of items rolled back
  const rolledPart = sprintf(__("Rolled back %d"), rolled);
  // Translators: %d = number of items skipped
  const skippedPart = skipped > 0 ? " " + sprintf(__("/ Skipped %d"), skipped) : "";
  return {
    mode: "rollback",
    jobId: r.job_id,
    headline: rolledPart + skippedPart,
    statusBadge: "rolled_back",
    rows: results.map(x => ({
      // Translators: %d = history row ID
      label: sprintf(__("History #%d"), x.history_id),
      status: x.status,
      detail: x.reason,
    })),
    canRollback: false,
  };
}
