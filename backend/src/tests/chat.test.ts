import { describe, expect, it, beforeAll } from "bun:test";
import { Hono } from "hono";
import { mountChat } from "../routes/chat";
import type { SessionStore } from "../lib/sessions";
import { tools } from "../lib/tools";
import type { AgentClient, Message } from "../lib/agent-loop";
import type { WpClient } from "../lib/wp-client";
import { signJwt } from "../lib/jwt";
import type { Tier } from "../lib/license/key-format";

const JWT_SECRET = "test-jwt-secret-32-bytes-min-pls!";

beforeAll(() => { process.env.JWT_SECRET = JWT_SECRET; });

const fakeWp = { listPosts: async () => ({ posts: [], next_cursor: null, total: 0 }) } as unknown as WpClient;

function makeFakeStore(): SessionStore & { lastMeta?: { siteUrl: string; licenseKey: string | null } } {
  const messages = new Map<string, Message[]>();
  const store = {
    lastMeta: undefined as { siteUrl: string; licenseKey: string | null } | undefined,
    async getOrCreate(id: string, meta: { siteUrl: string; licenseKey: string | null }) {
      store.lastMeta = meta;
      if (!messages.has(id)) messages.set(id, []);
      return messages.get(id)!;
    },
    async getMessages(id: string) {
      return messages.get(id) ?? [];
    },
    async appendMessage(id: string, msg: Message) {
      const arr = messages.get(id) ?? [];
      arr.push(msg);
      messages.set(id, arr);
    },
    async pruneOlderThan() { return 0; },
  };
  return store;
}

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
  const store = makeFakeStore();
  mountChat(app, {
    makeClient: () => client,
    sessionStore: store,
    wp: fakeWp,
    tools,
  });
  return { app, store };
}

function bearer(opts: { tier?: Tier; license_key?: string | null; site_url?: string } = {}): string {
  const now = Math.floor(Date.now() / 1000);
  return `Bearer ${signJwt(
    {
      site_url:    opts.site_url    ?? "https://x",
      license_key: opts.license_key ?? null,
      tier:        opts.tier        ?? "free",
      iat: now, exp: now + 3600,
    },
    { current: JWT_SECRET },
  )}`;
}

describe("POST /chat", () => {
  it("requires JWT (401 without Authorization header)", async () => {
    const { app } = makeApp(singleTurnClient(["x"]));
    const res = await app.request("/chat", {
      method: "POST",
      body: JSON.stringify({ session_id: "s1", message: "hi" }),
      headers: { "content-type": "application/json", "x-anthropic-key": "sk-..." },
    });
    expect(res.status).toBe(401);
  });

  it("rejects expired JWT (401)", async () => {
    const { app } = makeApp(singleTurnClient(["x"]));
    const past = Math.floor(Date.now() / 1000) - 100;
    const tok = signJwt(
      { site_url: "https://x", license_key: null, tier: "free", iat: past - 3600, exp: past },
      { current: JWT_SECRET },
    );
    const res = await app.request("/chat", {
      method: "POST",
      body: JSON.stringify({ session_id: "s1", message: "hi" }),
      headers: { "content-type": "application/json", "x-anthropic-key": "k", authorization: `Bearer ${tok}` },
    });
    expect(res.status).toBe(401);
  });

  it("requires x-anthropic-key", async () => {
    const { app } = makeApp(singleTurnClient(["x"]));
    const res = await app.request("/chat", {
      method: "POST",
      body: JSON.stringify({ session_id: "s1", message: "hi" }),
      headers: { "content-type": "application/json", authorization: bearer() },
    });
    expect(res.status).toBe(400);
  });

  it("requires session_id and message", async () => {
    const { app } = makeApp(singleTurnClient(["x"]));
    const res = await app.request("/chat", {
      method: "POST",
      body: JSON.stringify({ session_id: "s1" }),
      headers: { "content-type": "application/json", authorization: bearer(), "x-anthropic-key": "k" },
    });
    expect(res.status).toBe(400);
  });

  it("streams text and done, persists messages", async () => {
    const { app, store } = makeApp(singleTurnClient(["Hel", "lo"]));
    const res = await app.request("/chat", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: bearer(), "x-anthropic-key": "k" },
      body: JSON.stringify({ session_id: "s1", message: "hi" }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('event: text');
    expect(text).toContain('"delta":"Hel"');
    expect(text).toContain('event: done');
    const persisted = await store.getMessages("s1");
    expect(persisted.length).toBe(2);
    expect(persisted[0]).toMatchObject({ role: "user" });
    expect(persisted[1]).toMatchObject({ role: "assistant" });
  });

  it("forwards JWT site_url + license_key to SessionStore.getOrCreate", async () => {
    const { app, store } = makeApp(singleTurnClient(["ok"]));
    const res = await app.request("/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: bearer({ site_url: "https://shop.example", license_key: "AISEO-XYZ", tier: "pro" }),
        "x-anthropic-key": "k",
      },
      body: JSON.stringify({ session_id: "s2", message: "hi" }),
    });
    expect(res.status).toBe(200);
    expect(store.lastMeta).toEqual({ siteUrl: "https://shop.example", licenseKey: "AISEO-XYZ" });
  });
});
