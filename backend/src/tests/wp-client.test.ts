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
    const wp = createWpClient({ baseUrl: "https://site.example", sharedSecret: "s3cret", writeSecret: "test-write" });
    await wp.listPosts({ category: "news", limit: 5 });
    expect(calls.length).toBe(1);
    expect(calls[0].url).toContain("/wp-json/seoagent/v1/posts");
    expect(calls[0].url).toContain("category=news");
    expect(calls[0].url).toContain("limit=5");
    expect((calls[0].init.headers as Record<string,string>)["x-shared-secret"]).toBe("s3cret");
  });

  it("getPostSummary uses path id", async () => {
    const wp = createWpClient({ baseUrl: "https://site.example", sharedSecret: "s", writeSecret: "test-write" });
    await wp.getPostSummary(42);
    expect(calls[0].url).toBe("https://site.example/wp-json/seoagent/v1/post/42/summary");
  });

  it("getPostSummary round-trips content_preview field", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      id: 42,
      post_title: "Title",
      slug: "slug",
      status: "publish",
      modified: "2026-01-01 00:00:00",
      word_count: 5,
      content_preview: "preview text",
      current_seo: { title: null, description: null, focus_keyword: null, og_title: null },
    }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
    try {
      const wp = createWpClient({ baseUrl: "https://site.example", sharedSecret: "s", writeSecret: "test-write" });
      const result = await wp.getPostSummary(42);
      expect(result?.content_preview).toBe("preview text");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("throws on non-2xx", async () => {
    globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    const wp = createWpClient({ baseUrl: "https://site.example", sharedSecret: "s", writeSecret: "test-write" });
    await expect(wp.listPosts({})).rejects.toThrow(/500/);
  });

  it("forwards abort signal to fetch", async () => {
    const wp = createWpClient({ baseUrl: "https://site.example", sharedSecret: "s", writeSecret: "test-write" });
    const ac = new AbortController();
    await wp.listPosts({}, ac.signal);
    expect(calls[0].init.signal).toBe(ac.signal);
  });

  it("updateSeoFields POSTs JSON body with X-Write-Secret", async () => {
    const wp = createWpClient({ baseUrl: "https://site.example", sharedSecret: "r", writeSecret: "w" });
    await wp.updateSeoFields(42, { title: "X" });
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe("https://site.example/wp-json/seoagent/v1/post/42/seo-fields");
    expect((calls[0].init.headers as Record<string,string>)["x-write-secret"]).toBe("w");
    expect((calls[0].init.headers as Record<string,string>)["x-shared-secret"]).toBeUndefined();
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body as string).toContain('"title":"X"');
  });

  it("updateSeoFields includes job_id when provided", async () => {
    const wp = createWpClient({ baseUrl: "https://site.example", sharedSecret: "r", writeSecret: "w" });
    await wp.updateSeoFields(42, { title: "X" }, "job-uuid");
    const body = JSON.parse((calls[0].init.body as string));
    expect(body.job_id).toBe("job-uuid");
  });

  it("getHistory uses x-shared-secret (it's a read endpoint)", async () => {
    const wp = createWpClient({ baseUrl: "https://site.example", sharedSecret: "r", writeSecret: "w" });
    await wp.getHistory({ post_id: 42, limit: 10 });
    expect(calls[0].url).toContain("post_id=42");
    expect(calls[0].url).toContain("limit=10");
    expect((calls[0].init.headers as Record<string,string>)["x-shared-secret"]).toBe("r");
    expect((calls[0].init.headers as Record<string,string>)["x-write-secret"]).toBeUndefined();
  });

  it("rollback POSTs history_ids with X-Write-Secret", async () => {
    const wp = createWpClient({ baseUrl: "https://site.example", sharedSecret: "r", writeSecret: "w" });
    await wp.rollback([17, 18]);
    expect(calls[0].url).toBe("https://site.example/wp-json/seoagent/v1/rollback");
    expect((calls[0].init.headers as Record<string,string>)["x-write-secret"]).toBe("w");
    const body = JSON.parse((calls[0].init.body as string));
    expect(body.history_ids).toEqual([17, 18]);
  });
});
