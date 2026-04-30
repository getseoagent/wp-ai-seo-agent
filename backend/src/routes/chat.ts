import { Hono } from "hono";
import { stream } from "hono/streaming";
import { requireJwt } from "../lib/auth";
import type { JwtPayload } from "../lib/jwt";
import { sseFormat, classifyError, type SseEvent } from "../lib/sse";
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
  app.use("/chat", requireJwt);

  app.post("/chat", async (c) => {
    const apiKey = c.req.header("x-anthropic-key");
    if (!apiKey) return c.json({ error: "x-anthropic-key header required" }, 400);
    const psiKey = c.req.header("x-psi-key") ?? "";

    let body: ChatRequest;
    try { body = await c.req.json(); }
    catch { return c.json({ error: "invalid JSON" }, 400); }

    if (!body.session_id || !body.message) {
      return c.json({ error: "session_id and message required" }, 400);
    }

    const jwt = c.get("jwt" as never) as JwtPayload;
    await deps.sessionStore.getOrCreate(body.session_id, { siteUrl: jwt.site_url, licenseKey: jwt.license_key });
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
          tier: jwt.tier,
          psiKey,
          licenseKey: jwt.license_key,
        })) {
          if (ev.type === "text") assistantText += ev.delta;
          await s.write(sseFormat(ev));
        }
        if (assistantText.length > 0) {
          await deps.sessionStore.appendMessage(body.session_id, { role: "assistant", content: assistantText });
        }
      } catch (err) {
        await s.write(sseFormat(classifyError(err)));
      }
    });
  });
}
