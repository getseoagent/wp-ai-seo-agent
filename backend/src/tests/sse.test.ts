import { describe, expect, it } from "bun:test";
import { sseFormat } from "../lib/sse";

describe("sseFormat", () => {
  it("formats a text event with delta", () => {
    const out = sseFormat({ type: "text", delta: "hello" });
    expect(out).toBe('event: text\ndata: {"type":"text","delta":"hello"}\n\n');
  });

  it("formats a done event", () => {
    const out = sseFormat({ type: "done" });
    expect(out).toBe('event: done\ndata: {"type":"done"}\n\n');
  });

  it("escapes newlines inside delta", () => {
    const out = sseFormat({ type: "text", delta: "a\nb" });
    expect(out).toBe('event: text\ndata: {"type":"text","delta":"a\\nb"}\n\n');
  });
});
