import { useEffect, useState, useCallback } from "react";
import type { Job } from "./useJobPolling";

const SINCE_MINUTES = 30;

export type RecentJobsBannerState = {
  banner: Job | null;
  dismiss: () => void;
};

/**
 * Plan 4-B: on chat mount, fetch the most recent completed job from the
 * last 30 minutes. If found AND not previously dismissed (localStorage flag),
 * surfaces it as a "finished while you were away" banner so users who closed
 * the tab don't lose the result.
 */
export function useRecentJobsBanner(restUrlBase: string): RecentJobsBannerState {
  const [banner, setBanner] = useState<Job | null>(null);

  const dismiss = useCallback(() => {
    setBanner(prev => {
      if (prev) {
        try { localStorage.setItem(`dismissed-job-${prev.id}`, "1"); } catch { /* private mode etc. */ }
      }
      return null;
    });
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    // ISO date-time without timezone suffix (matches MySQL DATETIME format the
    // PHP layer expects in the `since` param).
    const since = new Date(Date.now() - SINCE_MINUTES * 60 * 1000)
      .toISOString()
      .replace("T", " ")
      .replace(/\..+/, "");
    fetch(`${restUrlBase}/jobs?status=completed&since=${encodeURIComponent(since)}&limit=1`, {
      credentials: "same-origin",
      signal: ac.signal,
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((body: { jobs: Job[] }) => {
        const top = body.jobs?.[0];
        if (!top) return;
        try {
          if (localStorage.getItem(`dismissed-job-${top.id}`) === "1") return;
        } catch { /* private mode — show banner anyway */ }
        setBanner(top);
      })
      .catch(err => {
        // Best-effort feature; silent failure is fine.
        if ((err as Error).name !== "AbortError") {
          // (no-op)
        }
      });
    return () => ac.abort();
  }, [restUrlBase]);

  return { banner, dismiss };
}
