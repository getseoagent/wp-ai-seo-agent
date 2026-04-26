import { describe, expect, it } from "bun:test";
import { sseFormat, type SseEvent } from "../lib/sse";

describe("sseFormat", () => {
  it("serializes a text delta", () => {
    const out = sseFormat({ type: "text", delta: "Hi" });
    expect(out).toBe('event: text\ndata: {"type":"text","delta":"Hi"}\n\n');
  });

  it("serializes a tool_call event", () => {
    const ev: SseEvent = { type: "tool_call", id: "tu_1", name: "list_posts", args: { limit: 5 } };
    const out = sseFormat(ev);
    expect(out).toContain('event: tool_call');
    expect(out).toContain('"name":"list_posts"');
    expect(out).toContain('"args":{"limit":5}');
  });

  it("serializes a tool_result event", () => {
    const out = sseFormat({ type: "tool_result", id: "tu_1", result: { posts: [] } });
    expect(out).toContain('event: tool_result');
    expect(out).toContain('"result":{"posts":[]}');
  });

  it("serializes done", () => {
    expect(sseFormat({ type: "done" })).toBe('event: done\ndata: {"type":"done"}\n\n');
  });

  it("serializes error", () => {
    expect(sseFormat({ type: "error", message: "oops" })).toContain('event: error');
  });
});
