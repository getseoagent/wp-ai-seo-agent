import { describe, expect, it, beforeAll } from "bun:test";
import { Hono } from "hono";
import { mountChat } from "../routes/chat";
import type { StreamFn } from "../lib/anthropic";

beforeAll(() => {
  process.env.SHARED_SECRET = "test-secret";
});

function makeApp(stream: StreamFn) {
  const app = new Hono();
  mountChat(app, stream);
  return app;
}

describe("POST /chat", () => {
  it("requires shared secret", async () => {
    const app = makeApp(async function* () { yield "x"; });
    const res = await app.request("/chat", {
      method: "POST",
      body: JSON.stringify({ message: "hi" }),
      headers: { "content-type": "application/json", "x-anthropic-key": "sk-..." },
    });
    expect(res.status).toBe(401);
  });

  it("requires x-anthropic-key header", async () => {
    const app = makeApp(async function* () { yield "x"; });
    const res = await app.request("/chat", {
      method: "POST",
      body: JSON.stringify({ message: "hi" }),
      headers: {
        "content-type": "application/json",
        "x-shared-secret": "test-secret",
      },
    });
    expect(res.status).toBe(400);
  });

  it("streams text deltas then done", async () => {
    const app = makeApp(async function* () {
      yield "Hel";
      yield "lo";
    });
    const res = await app.request("/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-shared-secret": "test-secret",
        "x-anthropic-key": "sk-...",
      },
      body: JSON.stringify({ message: "hi" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const text = await res.text();
    expect(text).toContain('event: text\ndata: {"type":"text","delta":"Hel"}');
    expect(text).toContain('event: text\ndata: {"type":"text","delta":"lo"}');
    expect(text).toContain('event: done\ndata: {"type":"done"}');
  });

  it("emits error event when streamer throws", async () => {
    const app = makeApp(async function* () {
      yield "ok";
      throw new Error("boom");
    });
    const res = await app.request("/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-shared-secret": "test-secret",
        "x-anthropic-key": "sk-...",
      },
      body: JSON.stringify({ message: "hi" }),
    });
    const text = await res.text();
    expect(text).toContain('event: error');
    expect(text).toContain('boom');
  });
});
