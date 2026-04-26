import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { createWpClient } from "../lib/wp-client";

describe("WpClient", () => {
  const calls: { url: string; init: RequestInit }[] = [];
  let restoreFetch: () => void;

  beforeEach(() => {
    calls.length = 0;
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    restoreFetch = () => { globalThis.fetch = original; };
  });
  afterEach(() => restoreFetch());

  it("listPosts forwards query params and shared-secret header", async () => {
    const wp = createWpClient({ baseUrl: "https://site.example", sharedSecret: "s3cret" });
    await wp.listPosts({ category: "news", limit: 5 });
    expect(calls.length).toBe(1);
    expect(calls[0].url).toContain("/wp-json/seoagent/v1/posts");
    expect(calls[0].url).toContain("category=news");
    expect(calls[0].url).toContain("limit=5");
    expect((calls[0].init.headers as Record<string,string>)["x-shared-secret"]).toBe("s3cret");
  });

  it("getPostSummary uses path id", async () => {
    const wp = createWpClient({ baseUrl: "https://site.example", sharedSecret: "s" });
    await wp.getPostSummary(42);
    expect(calls[0].url).toBe("https://site.example/wp-json/seoagent/v1/post/42/summary");
  });

  it("throws on non-2xx", async () => {
    globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    const wp = createWpClient({ baseUrl: "https://site.example", sharedSecret: "s" });
    await expect(wp.listPosts({})).rejects.toThrow(/500/);
  });

  it("forwards abort signal to fetch", async () => {
    const wp = createWpClient({ baseUrl: "https://site.example", sharedSecret: "s" });
    const ac = new AbortController();
    await wp.listPosts({}, ac.signal);
    expect(calls[0].init.signal).toBe(ac.signal);
  });
});
