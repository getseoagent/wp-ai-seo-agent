import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRecentJobsBanner } from "./useRecentJobsBanner";
import type { Job } from "./useJobPolling";

const completedJob: Job = {
  id: "recent-1",
  tool_name: "apply_style_to_batch",
  status: "completed",
  total: 10,
  done: 9,
  failed_count: 1,
  style_hints: null,
  started_at: "2026-04-27T13:00:00Z",
  finished_at: "2026-04-27T13:01:30Z",
  cancel_requested_at: null,
  last_progress_at: null,
  current_post_id: null,
  current_post_title: null,
};

async function flushAsync() {
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
}

describe("useRecentJobsBanner", () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("returns null when no recent completed job", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ jobs: [] }), { status: 200 })));
    const { result } = renderHook(() => useRecentJobsBanner("/api"));
    await flushAsync();
    expect(result.current.banner).toBeNull();
  });

  it("returns the most recent job and exposes dismiss()", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ jobs: [completedJob] }), { status: 200 })));
    const { result } = renderHook(() => useRecentJobsBanner("/api"));
    await flushAsync();
    expect(result.current.banner?.id).toBe("recent-1");

    act(() => { result.current.dismiss(); });
    expect(result.current.banner).toBeNull();
    expect(localStorage.getItem("dismissed-job-recent-1")).toBe("1");
  });

  it("respects existing dismissal in localStorage", async () => {
    localStorage.setItem("dismissed-job-recent-1", "1");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ jobs: [completedJob] }), { status: 200 })));
    const { result } = renderHook(() => useRecentJobsBanner("/api"));
    await flushAsync();
    expect(result.current.banner).toBeNull();
  });

  it("hits /jobs with status=completed&limit=1 and a since param", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ jobs: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    renderHook(() => useRecentJobsBanner("/api"));
    await flushAsync();
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/jobs?status=completed");
    expect(url).toContain("limit=1");
    expect(url).toContain("since=");
  });
});
