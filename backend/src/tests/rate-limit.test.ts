import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { makeRateLimit } from "../lib/rate-limit";

function makeApp(perMin: number, windowMs?: number) {
  const app = new Hono();
  app.use("*", makeRateLimit({
    perMin,
    windowMs,
    ipFrom: c => c.req.header("x-test-ip") ?? "default",
  }));
  app.get("/", c => c.json({ ok: true }));
  return app;
}

async function hit(app: Hono, ip = "1.1.1.1"): Promise<Response> {
  return app.request("/", { headers: { "x-test-ip": ip } });
}

describe("makeRateLimit", () => {
  it("allows the first N requests, blocks the (N+1)th with 429 + Retry-After", async () => {
    const app = makeApp(3);
    expect((await hit(app)).status).toBe(200);
    expect((await hit(app)).status).toBe(200);
    expect((await hit(app)).status).toBe(200);
    const blocked = await hit(app);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toMatch(/^\d+$/);
    const body = await blocked.json() as { error: string; retry_after_seconds: number };
    expect(body.error).toBe("rate_limited");
    expect(body.retry_after_seconds).toBeGreaterThan(0);
  });

  it("buckets are per-IP — one IP exhausting doesn't block another", async () => {
    const app = makeApp(2);
    expect((await hit(app, "1.1.1.1")).status).toBe(200);
    expect((await hit(app, "1.1.1.1")).status).toBe(200);
    expect((await hit(app, "1.1.1.1")).status).toBe(429);

    expect((await hit(app, "2.2.2.2")).status).toBe(200);
    expect((await hit(app, "2.2.2.2")).status).toBe(200);
  });

  it("window reset replenishes tokens", async () => {
    // Tiny window so we can wait past it without slowing the test down.
    const app = makeApp(1, 50);
    expect((await hit(app)).status).toBe(200);
    expect((await hit(app)).status).toBe(429);
    await new Promise(r => setTimeout(r, 60));
    expect((await hit(app)).status).toBe(200);
  });

  it("falls through to a single shared bucket when no IP source is available", async () => {
    // No injected ipFrom; default reader looks at X-Forwarded-For / X-Real-IP.
    // With neither set everyone hits one shared bucket — defense-in-depth
    // still applies even without a proxy.
    const app = new Hono();
    app.use("*", makeRateLimit({ perMin: 1 }));
    app.get("/", c => c.json({ ok: true }));
    expect((await app.request("/")).status).toBe(200);
    expect((await app.request("/")).status).toBe(429);
  });

  it("reads X-Forwarded-For first, X-Real-IP second", async () => {
    const app = new Hono();
    app.use("*", makeRateLimit({ perMin: 1 }));
    app.get("/", c => c.json({ ok: true }));
    // Different XFF → different buckets, so both should pass.
    expect((await app.request("/", { headers: { "x-forwarded-for": "1.1.1.1, 10.0.0.1" } })).status).toBe(200);
    expect((await app.request("/", { headers: { "x-forwarded-for": "2.2.2.2, 10.0.0.1" } })).status).toBe(200);
    // Same XFF reused → second request blocked.
    expect((await app.request("/", { headers: { "x-forwarded-for": "1.1.1.1, 10.0.0.1" } })).status).toBe(429);
  });
});
