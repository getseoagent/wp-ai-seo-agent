import { describe, expect, it, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { parseSseChunks, useSseChat } from "./useSseChat";

describe("parseSseChunks", () => {
  it("splits two events", () => {
    const buf =
      'event: text\ndata: {"type":"text","delta":"Hi"}\n\n' +
      'event: done\ndata: {"type":"done"}\n\n';
    const { events, remainder } = parseSseChunks(buf);
    expect(events.length).toBe(2);
    expect(events[0]).toEqual({ type: "text", delta: "Hi" });
    expect(events[1]).toEqual({ type: "done" });
    expect(remainder).toBe("");
  });

  it("keeps incomplete trailing event in remainder", () => {
    const buf =
      'event: text\ndata: {"type":"text","delta":"X"}\n\n' +
      'event: text\ndata: {"type":"text","delta":"Y"';
    const { events, remainder } = parseSseChunks(buf);
    expect(events.length).toBe(1);
    expect(remainder).toContain('"delta":"Y"');
  });

  it("handles error event", () => {
    const buf = 'event: error\ndata: {"type":"error","message":"oops"}\n\n';
    const { events } = parseSseChunks(buf);
    expect(events[0]).toEqual({ type: "error", message: "oops" });
  });

  it("accepts CRLF line endings", () => {
    const buf =
      'event: text\r\ndata: {"type":"text","delta":"Hi"}\r\n\r\n' +
      'event: done\r\ndata: {"type":"done"}\r\n\r\n';
    const { events, remainder } = parseSseChunks(buf);
    expect(events.length).toBe(2);
    expect(events[0]).toEqual({ type: "text", delta: "Hi" });
    expect(events[1]).toEqual({ type: "done" });
    expect(remainder).toBe("");
  });

  it("parses tool_call event", () => {
    const buf = 'event: tool_call\ndata: {"type":"tool_call","id":"tu_1","name":"list_posts","args":{"limit":5}}\n\n';
    const { events } = parseSseChunks(buf);
    expect(events[0]).toEqual({ type: "tool_call", id: "tu_1", name: "list_posts", args: { limit: 5 } });
  });

  it("parses tool_result event", () => {
    const buf = 'event: tool_result\ndata: {"type":"tool_result","id":"tu_1","result":{"posts":[]}}\n\n';
    const { events } = parseSseChunks(buf);
    expect(events[0]).toEqual({ type: "tool_result", id: "tu_1", result: { posts: [] } });
  });

  it("parses bulk_progress event", () => {
    const buf =
      'event: bulk_progress\ndata: {"type":"bulk_progress","job_id":"j1","done":3,"total":10,"failed":0}\n\n';
    const { events } = parseSseChunks(buf);
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("bulk_progress");
    expect((events[0] as { done: number }).done).toBe(3);
  });
});

describe("useSseChat unmount cleanup", () => {
  const noop = (): void => {};
  const baseArgs = {
    endpoint:    "/chat",
    nonce:       "n",
    sessionId:   "s",
    onDelta:     noop,
    onToolCall:  noop,
    onToolResult: noop,
    onError:     noop,
  };
  let originalFetch: typeof globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("aborts the in-flight stream when the component unmounts", async () => {
    // Simulate a fetch that opens a stream and then waits forever for the
    // next chunk. We capture the AbortSignal so we can assert it fires.
    let captured: AbortSignal | null = null;
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      captured = init?.signal ?? null;
      // Body that blocks on read() until the signal fires.
      const stream = new ReadableStream({
        start(controller) {
          captured?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
        },
      });
      return new Response(stream, { status: 200 });
    }) as typeof globalThis.fetch;

    const { result, unmount } = renderHook(() => useSseChat(baseArgs));
    // Fire-and-forget — we don't await; the stream is parked.
    void act(() => { void result.current.send("hi"); });
    // Yield once so fetch resolves and the reader.read() hangs.
    await act(async () => { await Promise.resolve(); });
    expect(captured).not.toBeNull();
    expect(captured!.aborted).toBe(false);

    unmount();

    expect(captured!.aborted).toBe(true);
  });
});
