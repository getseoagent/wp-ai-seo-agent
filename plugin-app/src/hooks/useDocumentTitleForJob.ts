import { useEffect, useRef } from "react";
import type { JobPollState } from "./useJobPolling";

const DONE_FLASH_MS = 5000;

/**
 * Prefixes document.title with bulk job state for tab-bar awareness:
 * - while running:  "(N/M) <original>"
 * - on terminal:    "(✓) <original> · Done" for 5 seconds, then restored
 *
 * Captures the "original" title once on first mount (before any prefix is applied)
 * and restores it on unmount or when state returns to idle.
 */
export function useDocumentTitleForJob(state: JobPollState): void {
  const originalRef = useRef<string | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (originalRef.current === null) {
      originalRef.current = document.title;
    }
    const original = originalRef.current;

    if (flashTimerRef.current) {
      clearTimeout(flashTimerRef.current);
      flashTimerRef.current = null;
    }

    if (state.status === "running") {
      const { done, total } = state.job;
      document.title = `(${done}/${total}) ${original}`;
    } else if (state.status === "terminal") {
      document.title = `(✓) ${original} · Done`;
      flashTimerRef.current = setTimeout(() => {
        document.title = original;
      }, DONE_FLASH_MS);
    } else {
      // idle: restore in case we're returning from a prior cycle
      if (document.title !== original) document.title = original;
    }

    return () => {
      if (flashTimerRef.current) {
        clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }
      if (originalRef.current !== null) {
        document.title = originalRef.current;
      }
    };
  }, [state]);
}
