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
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({
        posts: [
          { id: 1, post_title: "T", slug: "t", status: "publish", modified: "2026-01-01 00:00:00", word_count: 42 },
        ],
        next_cursor: null,
        total: 1,
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    try {
      const wp = createWpClient({ baseUrl: "https://site.example", jwtSecret: "test-jwt-secret-32-bytes-min-pls!", sharedSecret: "s3cret", writeSecret: "test-write" });
      const result = await wp.listPosts({ category: "news", limit: 5 });
      expect(calls.length).toBe(1);
      expect(calls[0].url).toContain("/wp-json/seoagent/v1/posts");
      expect(calls[0].url).toContain("category=news");
      expect(calls[0].url).toContain("limit=5");
      expect((calls[0].init.headers as Record<string,string>)["x-shared-secret"]).toBe("s3cret");
      expect(result.posts[0].word_count).toBe(42);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("getPostSummary uses path id", async () => {
    const wp = createWpClient({ baseUrl: "https://site.example", jwtSecret: "test-jwt-secret-32-bytes-min-pls!", sharedSecret: "s", writeSecret: "test-write" });
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
      const wp = createWpClient({ baseUrl: "https://site.example", jwtSecret: "test-jwt-secret-32-bytes-min-pls!", sharedSecret: "s", writeSecret: "test-write" });
      const result = await wp.getPostSummary(42);
      expect(result?.content_preview).toBe("preview text");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("throws on non-2xx", async () => {
    globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    const wp = createWpClient({ baseUrl: "https://site.example", jwtSecret: "test-jwt-secret-32-bytes-min-pls!", sharedSecret: "s", writeSecret: "test-write" });
    await expect(wp.listPosts({})).rejects.toThrow(/500/);
  });

  it("forwards abort signal to fetch", async () => {
    const wp = createWpClient({ baseUrl: "https://site.example", jwtSecret: "test-jwt-secret-32-bytes-min-pls!", sharedSecret: "s", writeSecret: "test-write" });
    const ac = new AbortController();
    await wp.listPosts({}, ac.signal);
    expect(calls[0].init.signal).toBe(ac.signal);
  });

  it("updateSeoFields POSTs JSON body with Bearer + X-Write-Secret (dual-mode)", async () => {
    const wp = createWpClient({ baseUrl: "https://site.example", jwtSecret: "test-jwt-secret-32-bytes-min-pls!", sharedSecret: "r", writeSecret: "w" });
    await wp.updateSeoFields(42, { title: "X" });
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe("https://site.example/wp-json/seoagent/v1/post/42/seo-fields");
    const headers = calls[0].init.headers as Record<string,string>;
    expect(headers["authorization"] ?? "").toMatch(/^Bearer\s+ey[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(headers["X-Write-Secret"]).toBe("w");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body as string).toContain('"title":"X"');
  });

  it("updateSeoFields includes job_id when provided", async () => {
    const wp = createWpClient({ baseUrl: "https://site.example", jwtSecret: "test-jwt-secret-32-bytes-min-pls!", sharedSecret: "r", writeSecret: "w" });
    await wp.updateSeoFields(42, { title: "X" }, "job-uuid");
    const body = JSON.parse((calls[0].init.body as string));
    expect(body.job_id).toBe("job-uuid");
  });

  it("getHistory sends Bearer + x-shared-secret on read endpoints (no X-Write-Secret)", async () => {
    const wp = createWpClient({ baseUrl: "https://site.example", jwtSecret: "test-jwt-secret-32-bytes-min-pls!", sharedSecret: "r", writeSecret: "w" });
    await wp.getHistory({ post_id: 42, limit: 10 });
    expect(calls[0].url).toContain("post_id=42");
    expect(calls[0].url).toContain("limit=10");
    const headers = calls[0].init.headers as Record<string,string>;
    expect(headers["authorization"] ?? "").toMatch(/^Bearer\s+ey[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(headers["x-shared-secret"]).toBe("r");
    expect(headers["X-Write-Secret"]).toBeUndefined();
  });

  it("rollback POSTs history_ids with X-Write-Secret", async () => {
    const wp = createWpClient({ baseUrl: "https://site.example", jwtSecret: "test-jwt-secret-32-bytes-min-pls!", sharedSecret: "r", writeSecret: "w" });
    await wp.rollback({ history_ids: [17, 18] });
    expect(calls[0].url).toBe("https://site.example/wp-json/seoagent/v1/rollback");
    expect((calls[0].init.headers as Record<string,string>)["X-Write-Secret"]).toBe("w");
    const body = JSON.parse((calls[0].init.body as string));
    expect(body.history_ids).toEqual([17, 18]);
  });
});

describe("WpClient — jobs", () => {
  it("createJob POSTs to /jobs and returns row", async () => {
    let captured: any = null;
    const mockFetch = (async (url: string, opts: any) => {
      captured = { url, opts };
      return new Response(JSON.stringify({
        id: "abc", user_id: 0, tool_name: "apply_style_to_batch",
        status: "running", total: 5, done: 0, failed_count: 0,
        style_hints: "x", params_json: "{}",
        started_at: "2026-04-26 12:00:00", finished_at: null,
        cancel_requested_at: null, last_progress_at: null,
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const orig = globalThis.fetch;
    globalThis.fetch = mockFetch;
    try {
      const wp = createWpClient({ baseUrl: "https://example", jwtSecret: "test-jwt-secret-32-bytes-min-pls!", sharedSecret: "s", writeSecret: "w" });
      const job = await wp.createJob({ id: "abc", user_id: 0, tool_name: "apply_style_to_batch", total: 5, style_hints: "x", params_json: "{}" });
      expect(job.id).toBe("abc");
      expect(captured.url).toContain("/seoagent/v1/jobs");
      expect(captured.opts.method).toBe("POST");
      expect(captured.opts.headers["X-Write-Secret"]).toBe("w");
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("getJob GETs /jobs/<id>", async () => {
    const mockFetch = (async (url: string) => {
      if (url.includes("/jobs/jx")) {
        return new Response(JSON.stringify({ id: "jx", status: "running", total: 5, done: 1, failed_count: 0, started_at: "x", finished_at: null, cancel_requested_at: null, last_progress_at: null, user_id: 0, tool_name: "t", style_hints: null, params_json: null }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    const orig = globalThis.fetch;
    globalThis.fetch = mockFetch;
    try {
      const wp = createWpClient({ baseUrl: "https://example", jwtSecret: "test-jwt-secret-32-bytes-min-pls!", sharedSecret: "s" });
      const job = await wp.getJob("jx");
      expect(job?.id).toBe("jx");
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("getJob returns null on 404", async () => {
    const mockFetch = (async () => new Response("not found", { status: 404 })) as typeof fetch;
    const orig = globalThis.fetch;
    globalThis.fetch = mockFetch;
    try {
      const wp = createWpClient({ baseUrl: "https://example", jwtSecret: "test-jwt-secret-32-bytes-min-pls!", sharedSecret: "s" });
      const job = await wp.getJob("missing");
      expect(job).toBeNull();
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("updateJobProgress posts done and failed_count", async () => {
    let captured: any = null;
    const mockFetch = (async (url: string, opts: any) => {
      captured = { url, body: JSON.parse(opts.body), method: opts.method };
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const orig = globalThis.fetch;
    globalThis.fetch = mockFetch;
    try {
      const wp = createWpClient({ baseUrl: "https://example", jwtSecret: "test-jwt-secret-32-bytes-min-pls!", sharedSecret: "s", writeSecret: "w" });
      await wp.updateJobProgress("j1", 5, 1);
      expect(captured.url).toContain("/jobs/j1/progress");
      expect(captured.method).toBe("POST");
      expect(captured.body).toEqual({ done: 5, failed_count: 1 });
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("markJobDone posts status", async () => {
    let captured: any = null;
    const mockFetch = (async (url: string, opts: any) => {
      captured = { url, body: JSON.parse(opts.body) };
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const orig = globalThis.fetch;
    globalThis.fetch = mockFetch;
    try {
      const wp = createWpClient({ baseUrl: "https://example", jwtSecret: "test-jwt-secret-32-bytes-min-pls!", sharedSecret: "s", writeSecret: "w" });
      await wp.markJobDone("j1", "completed");
      expect(captured.url).toContain("/jobs/j1/done");
      expect(captured.body).toEqual({ status: "completed" });
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("cancelJob posts to /jobs/<id>/cancel", async () => {
    let captured: any = null;
    const mockFetch = (async (url: string, opts: any) => {
      captured = { url, method: opts.method };
      return new Response(JSON.stringify({ status: "cancel_requested" }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const orig = globalThis.fetch;
    globalThis.fetch = mockFetch;
    try {
      const wp = createWpClient({ baseUrl: "https://example", jwtSecret: "test-jwt-secret-32-bytes-min-pls!", sharedSecret: "s", writeSecret: "w" });
      await wp.cancelJob("j1");
      expect(captured.url).toContain("/jobs/j1/cancel");
      expect(captured.method).toBe("POST");
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("findRunningJobForUser returns first or null", async () => {
    // Plan 4-B: response wrapped in {jobs:[...]} (also carries empty array for "no rows").
    const mockFetch = (async (url: string) => {
      if (url.includes("user_id=7")) {
        return new Response(JSON.stringify({ jobs: [{ id: "j1", user_id: 7, status: "running", total: 5, done: 0, failed_count: 0, tool_name: "t", style_hints: null, params_json: null, started_at: "x", finished_at: null, cancel_requested_at: null, last_progress_at: null }] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ jobs: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const orig = globalThis.fetch;
    globalThis.fetch = mockFetch;
    try {
      const wp = createWpClient({ baseUrl: "https://example", jwtSecret: "test-jwt-secret-32-bytes-min-pls!", sharedSecret: "s" });
      const job = await wp.findRunningJobForUser(7);
      expect(job?.id).toBe("j1");
      const empty = await wp.findRunningJobForUser(99);
      expect(empty).toBeNull();
    } finally {
      globalThis.fetch = orig;
    }
  });
});
