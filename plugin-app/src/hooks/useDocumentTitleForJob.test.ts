import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDocumentTitleForJob } from "./useDocumentTitleForJob";
import type { JobPollState, Job } from "./useJobPolling";

const j = (over: Partial<Job> = {}): Job => ({
  id: "x", tool_name: "apply_style_to_batch", status: "running",
  total: 10, done: 0, failed_count: 0, style_hints: null,
  started_at: "x", finished_at: null, cancel_requested_at: null,
  last_progress_at: null, current_post_id: null, current_post_title: null,
  ...over,
});

describe("useDocumentTitleForJob", () => {
  beforeEach(() => {
    document.title = "SEO Agent";
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
    document.title = "SEO Agent";
  });

  it("prefixes (N/M) while running", () => {
    const ps: JobPollState = { status: "running", job: j({ done: 3, total: 10 }), applyOptimistic: () => {} };
    renderHook(() => useDocumentTitleForJob(ps));
    expect(document.title).toBe("(3/10) SEO Agent");
  });

  it("flashes (✓) ... · Done for 5s on terminal then restores", () => {
    const initialState: JobPollState = { status: "running", job: j({ done: 9, total: 10 }), applyOptimistic: () => {} };
    const { rerender } = renderHook<void, { ps: JobPollState }>(
      ({ ps }) => useDocumentTitleForJob(ps),
      { initialProps: { ps: initialState } },
    );
    expect(document.title).toBe("(9/10) SEO Agent");

    const terminal: JobPollState = { status: "terminal", job: j({ status: "completed", done: 10, total: 10, finished_at: "x" }) };
    rerender({ ps: terminal });
    expect(document.title).toBe("(✓) SEO Agent · Done");

    act(() => { vi.advanceTimersByTime(5001); });
    expect(document.title).toBe("SEO Agent");
  });

  it("idle leaves restored title", () => {
    document.title = "untouched";
    renderHook(() => useDocumentTitleForJob({ status: "idle" }));
    expect(document.title).toBe("untouched");
  });

  it("restores on unmount", () => {
    document.title = "before";
    const ps: JobPollState = { status: "running", job: j({ done: 1, total: 5 }), applyOptimistic: () => {} };
    const { unmount } = renderHook(() => useDocumentTitleForJob(ps));
    expect(document.title).toBe("(1/5) before");
    unmount();
    expect(document.title).toBe("before");
  });
});
