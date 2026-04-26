import { Hono } from "hono";
import { stream } from "hono/streaming";
import { requireSharedSecret } from "../lib/auth";
import { sseFormat } from "../lib/sse";
import type { StreamFn } from "../lib/anthropic";

type ChatRequest = {
  message: string;
};

export function mountChat(app: Hono, streamer: StreamFn): void {
  app.use("/chat", requireSharedSecret);

  app.post("/chat", async (c) => {
    const apiKey = c.req.header("x-anthropic-key");
    if (!apiKey) {
      return c.json({ error: "x-anthropic-key header required" }, 400);
    }
    let body: ChatRequest;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON" }, 400);
    }
    if (!body.message) {
      return c.json({ error: "message required" }, 400);
    }

    return stream(c, async (s) => {
      s.onAbort(() => {});
      c.header("content-type", "text/event-stream");
      c.header("cache-control", "no-cache");
      c.header("x-accel-buffering", "no");
      try {
        for await (const delta of streamer({
          apiKey,
          message: body.message,
        })) {
          await s.write(sseFormat({ type: "text", delta }));
        }
        await s.write(sseFormat({ type: "done" }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await s.write(sseFormat({ type: "error", message: msg }));
      }
    });
  });
}
