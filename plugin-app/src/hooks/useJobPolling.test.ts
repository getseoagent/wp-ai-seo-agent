import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useJobPolling, type Job } from "./useJobPolling";

const makeJob = (over: Partial<Job> = {}): Job => ({
  id: "test-job",
  tool_name: "apply_style_to_batch",
  status: "running",
  total: 10,
  done: 0,
  failed_count: 0,
  style_hints: null,
  started_at: "2026-04-27T10:00:00Z",
  finished_at: null,
  cancel_requested_at: null,
  last_progress_at: null,
  current_post_id: null,
  current_post_title: null,
  ...over,
});

// Lets the microtask queue drain so resolved fetch promises propagate
// to setState before we assert. Two ticks: one for the fetch promise,
// one for the .json() promise inside the hook.
async function flushAsync() {
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
}

describe("useJobPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns idle when jobId is null", () => {
    const { result } = renderHook(() => useJobPolling(null, "/api"));
    expect(result.current.status).toBe("idle");
  });

  it("polls every 2s while running", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(makeJob({ done: 1 })), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(makeJob({ done: 2 })), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(makeJob({ done: 3 })), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useJobPolling("test-job", "/api"));
    await flushAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("running");
    if (result.current.status === "running") expect(result.current.job.done).toBe(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    await flushAsync();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    if (result.current.status === "running") expect(result.current.job.done).toBe(2);

    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    await flushAsync();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("stops polling on terminal status", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(makeJob({ done: 5 })), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(makeJob({ status: "completed", done: 10, finished_at: "2026-04-27T10:01:00Z" })), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useJobPolling("test-job", "/api"));
    await flushAsync();
    expect(result.current.status).toBe("running");

    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    await flushAsync();
    expect(result.current.status).toBe("terminal");

    // Next would-be tick must NOT fire.
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats interrupted as terminal", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(makeJob({ status: "interrupted" })), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useJobPolling("test-job", "/api"));
    await flushAsync();
    expect(result.current.status).toBe("terminal");
    if (result.current.status === "terminal") {
      expect(result.current.job.status).toBe("interrupted");
    }
  });

  it("applyOptimistic patches running state", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(makeJob({ done: 1 })), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useJobPolling("test-job", "/api"));
    await flushAsync();
    expect(result.current.status).toBe("running");

    act(() => {
      if (result.current.status === "running") {
        result.current.applyOptimistic({ done: 4, current_post_id: 17, current_post_title: "T" });
      }
    });
    if (result.current.status === "running") {
      expect(result.current.job.done).toBe(4);
      expect(result.current.job.current_post_title).toBe("T");
    }
  });

  it("retries once after fetch error before giving up", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(new Response(JSON.stringify(makeJob({ done: 7 })), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useJobPolling("test-job", "/api"));
    await flushAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("idle");

    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    await flushAsync();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("running");
    if (result.current.status === "running") expect(result.current.job.done).toBe(7);
  });
});
