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
  return !!x && typeof x === "object"
    && typeof (x as any).applied === "number"
    && Array.isArray((x as any).results);
}

export function formatBulkSummary(input: unknown): FormattedBulkSummary {
  if (isApplyInput(input)) {
    return {
      mode: "apply",
      jobId: input.job_id,
      headline: `Applied ${input.applied} / Failed ${input.failed} / Skipped ${input.skipped}`,
      statusBadge: input.status,
      rows: input.results.map(r => ({
        label: `Post ${r.post_id}`,
        status: r.status,
        detail: r.status === "applied"
          ? `${r.title_before ?? "(no title)"} → ${r.title_after}`
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
  return {
    mode: "rollback",
    jobId: r.job_id,
    headline: `Rolled back ${rolled} ${skipped > 0 ? `/ Skipped ${skipped}` : ""}`.trim(),
    statusBadge: "rolled_back",
    rows: results.map(x => ({
      label: `History #${x.history_id}`,
      status: x.status,
      detail: x.reason,
    })),
    canRollback: false,
  };
}
