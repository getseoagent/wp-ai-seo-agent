import { describe, expect, it } from "vitest";
import { parseSseChunks } from "./useSseChat";

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
});
