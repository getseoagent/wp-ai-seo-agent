import { describe, expect, it, beforeAll } from "bun:test";
import { Hono } from "hono";
import { mountChat } from "../routes/chat";
import { createSessionStore } from "../lib/sessions";
import { tools } from "../lib/tools";
import type { AgentClient } from "../lib/agent-loop";
import type { WpClient } from "../lib/wp-client";

beforeAll(() => { process.env.SHARED_SECRET = "test-secret"; });

const fakeWp = { listPosts: async () => ({ posts: [], next_cursor: null, total: 0 }) } as unknown as WpClient;

function singleTurnClient(deltas: string[]): AgentClient {
  return {
    stream() {
      const final = { content: deltas.map(d => ({ type: "text" as const, text: d })), stop_reason: "end_turn" };
      return {
        async *[Symbol.asyncIterator]() { for (const d of deltas) yield { type: "text", delta: d } as const; },
        async finalMessage() { return final; },
      };
    },
  };
}

function makeApp(client: AgentClient) {
  const app = new Hono();
  const store = createSessionStore({ maxSessions: 10, now: () => 1 });
  mountChat(app, {
    makeClient: () => client,
    sessionStore: store,
    wp: fakeWp,
    tools,
  });
  return { app, store };
}

describe("POST /chat", () => {
  it("requires shared secret", async () => {
    const { app } = makeApp(singleTurnClient(["x"]));
    const res = await app.request("/chat", {
      method: "POST",
      body: JSON.stringify({ session_id: "s1", message: "hi" }),
      headers: { "content-type": "application/json", "x-anthropic-key": "sk-..." },
    });
    expect(res.status).toBe(401);
  });

  it("requires x-anthropic-key", async () => {
    const { app } = makeApp(singleTurnClient(["x"]));
    const res = await app.request("/chat", {
      method: "POST",
      body: JSON.stringify({ session_id: "s1", message: "hi" }),
      headers: { "content-type": "application/json", "x-shared-secret": "test-secret" },
    });
    expect(res.status).toBe(400);
  });

  it("requires session_id and message", async () => {
    const { app } = makeApp(singleTurnClient(["x"]));
    const res = await app.request("/chat", {
      method: "POST",
      body: JSON.stringify({ session_id: "s1" }),
      headers: { "content-type": "application/json", "x-shared-secret": "test-secret", "x-anthropic-key": "k" },
    });
    expect(res.status).toBe(400);
  });

  it("streams text and done, persists messages", async () => {
    const { app, store } = makeApp(singleTurnClient(["Hel", "lo"]));
    const res = await app.request("/chat", {
      method: "POST",
      headers: { "content-type": "application/json", "x-shared-secret": "test-secret", "x-anthropic-key": "k" },
      body: JSON.stringify({ session_id: "s1", message: "hi" }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('event: text');
    expect(text).toContain('"delta":"Hel"');
    expect(text).toContain('event: done');
    const persisted = store.get("s1");
    expect(persisted.length).toBe(2); // user msg + assistant final
    expect(persisted[0]).toMatchObject({ role: "user" });
    expect(persisted[1]).toMatchObject({ role: "assistant" });
  });
});
