import { Hono } from "hono";
import { stream } from "hono/streaming";
import { requireSharedSecret } from "../lib/auth";
import { sseFormat, type SseEvent } from "../lib/sse";
import { runAgent, type AgentClient, type Message } from "../lib/agent-loop";
import type { Tool } from "../lib/tools";
import type { WpClient } from "../lib/wp-client";
import type { SessionStore } from "../lib/sessions";
import { makeDefaultCraft } from "../lib/craft";

type ChatDeps = {
  makeClient: (apiKey: string) => AgentClient;
  sessionStore: SessionStore;
  wp: WpClient;
  tools: Tool[];
};

type ChatRequest = { session_id: string; message: string };

export function mountChat(app: Hono, deps: ChatDeps): void {
  app.use("/chat", requireSharedSecret);

  app.post("/chat", async (c) => {
    const apiKey = c.req.header("x-anthropic-key");
    if (!apiKey) return c.json({ error: "x-anthropic-key header required" }, 400);

    let body: ChatRequest;
    try { body = await c.req.json(); }
    catch { return c.json({ error: "invalid JSON" }, 400); }

    if (!body.session_id || !body.message) {
      return c.json({ error: "session_id and message required" }, 400);
    }

    // Block 3 will replace siteUrl/licenseKey with JWT-derived values.
    await deps.sessionStore.getOrCreate(body.session_id, { siteUrl: "unknown", licenseKey: null });
    await deps.sessionStore.appendMessage(body.session_id, { role: "user", content: body.message });
    const messages: Message[] = await deps.sessionStore.getMessages(body.session_id);

    const client = deps.makeClient(apiKey);
    const craft = makeDefaultCraft(apiKey);
    const ac = new AbortController();

    return stream(c, async (s) => {
      s.onAbort(() => ac.abort());
      const emit = (ev: SseEvent) => { void s.write(sseFormat(ev)); };
      c.header("content-type", "text/event-stream");
      c.header("cache-control", "no-cache");
      c.header("x-accel-buffering", "no");

      let assistantText = "";
      try {
        for await (const ev of runAgent({
          messages,
          wp: deps.wp,
          signal: ac.signal,
          client,
          tools: deps.tools,
          craft,
          emit,
        })) {
          if (ev.type === "text") assistantText += ev.delta;
          await s.write(sseFormat(ev));
        }
        if (assistantText.length > 0) {
          await deps.sessionStore.appendMessage(body.session_id, { role: "assistant", content: assistantText });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await s.write(sseFormat({ type: "error", message: msg }));
      }
    });
  });
}
