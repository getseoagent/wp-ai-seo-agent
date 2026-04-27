import { useEffect, useRef, useState, useCallback } from "react";

export type Job = {
  id: string;
  tool_name: string;
  status: "running" | "completed" | "cancelled" | "failed" | "interrupted";
  total: number;
  done: number;
  failed_count: number;
  style_hints: string | null;
  started_at: string;
  finished_at: string | null;
  cancel_requested_at: string | null;
  last_progress_at: string | null;
  current_post_id: number | null;
  current_post_title: string | null;
};

export type JobPollState =
  | { status: "idle" }
  | { status: "running"; job: Job; applyOptimistic: (patch: Partial<Job>) => void }
  | { status: "terminal"; job: Job };

const POLL_INTERVAL_MS = 2000;
const RETRY_AFTER_ERROR_MS = 5000;
const TERMINAL_STATUSES: Array<Job["status"]> = ["completed", "cancelled", "failed", "interrupted"];

/**
 * 2-second poller for a single bulk job's state. Source of truth for
 * BulkProgressBar / BulkSummaryCard — survives client disconnect because the
 * job is owned by the backend (DB row), not by any HTTP request.
 *
 * applyOptimistic exposes a way for SSE bulk_progress events (when the chat
 * stream is alive) to patch the state between polls for smoother bar movement.
 * The next poll tick is authoritative on conflict.
 */
export function useJobPolling(jobId: string | null, restUrlBase: string): JobPollState {
  const [state, setState] = useState<JobPollState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyOptimistic = useCallback((patch: Partial<Job>) => {
    setState(prev => {
      if (prev.status !== "running") return prev;
      return { ...prev, job: { ...prev.job, ...patch } };
    });
  }, []);

  const poll = useCallback(async (id: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch(`${restUrlBase}/jobs/${encodeURIComponent(id)}`, {
        credentials: "same-origin",
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const job = (await res.json()) as Job;
      const isTerminal = TERMINAL_STATUSES.includes(job.status);
      if (isTerminal) {
        setState({ status: "terminal", job });
      } else {
        setState({ status: "running", job, applyOptimistic });
        timerRef.current = setTimeout(() => poll(id), POLL_INTERVAL_MS);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      // Single retry policy: schedule one more attempt after a longer delay.
      // If THAT also fails the timer just won't fire again; user keeps last
      // good state in the UI (no error toast in v1).
      timerRef.current = setTimeout(() => poll(id), RETRY_AFTER_ERROR_MS);
    }
  }, [restUrlBase, applyOptimistic]);

  useEffect(() => {
    if (!jobId) {
      setState({ status: "idle" });
      return;
    }
    poll(jobId);
    return () => {
      abortRef.current?.abort();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [jobId, poll]);

  return state;
}
