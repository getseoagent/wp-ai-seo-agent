import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { Hono } from "hono";
import { requireJwt, type JwtVariables } from "../lib/auth";
import { signJwt } from "../lib/jwt";

const SECRET = "test-jwt-secret-32-bytes-min-pls!";
const PREV   = "previous-jwt-secret-32-bytes-pls!";

const prevEnv: Record<string, string | undefined> = {};
beforeAll(() => {
  prevEnv.JWT_SECRET = process.env.JWT_SECRET;
  prevEnv.JWT_SECRET_PREVIOUS = process.env.JWT_SECRET_PREVIOUS;
  process.env.JWT_SECRET = SECRET;
  delete process.env.JWT_SECRET_PREVIOUS;
});
afterAll(() => {
  if (prevEnv.JWT_SECRET === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = prevEnv.JWT_SECRET;
  if (prevEnv.JWT_SECRET_PREVIOUS === undefined) delete process.env.JWT_SECRET_PREVIOUS; else process.env.JWT_SECRET_PREVIOUS = prevEnv.JWT_SECRET_PREVIOUS;
});

function makeApp() {
  const app = new Hono<{ Variables: JwtVariables }>();
  app.use("*", requireJwt);
  app.get("/me", (c) => {
    const jwt = c.get("jwt");
    return c.json({ tier: jwt.tier, site_url: jwt.site_url, license_key: jwt.license_key });
  });
  return app;
}

function tokenFor(opts: { tier?: "free" | "starter" | "pro" | "agency"; expiresInSec?: number; secret?: string; license_key?: string | null } = {}): string {
  const now = Math.floor(Date.now() / 1000);
  const exp = opts.expiresInSec === undefined ? now + 3600 : now + opts.expiresInSec;
  return signJwt(
    { site_url: "https://x", license_key: opts.license_key ?? null, tier: opts.tier ?? "free", iat: now, exp },
    { current: opts.secret ?? SECRET },
  );
}

describe("requireJwt", () => {
  it("rejects request without Authorization header (401)", async () => {
    const res = await makeApp().request("/me");
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("missing_token");
  });

  it("rejects Authorization without Bearer scheme (401)", async () => {
    const res = await makeApp().request("/me", { headers: { authorization: "Basic abc" } });
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("missing_token");
  });

  it("rejects malformed token (401)", async () => {
    const res = await makeApp().request("/me", { headers: { authorization: "Bearer onlyonesegment" } });
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("malformed");
  });

  it("rejects bad signature (401)", async () => {
    const tok = tokenFor({ secret: "different-secret-not-the-server-one!" });
    const res = await makeApp().request("/me", { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("bad_signature");
  });

  it("rejects expired token (401)", async () => {
    const tok = tokenFor({ expiresInSec: -10 });
    const res = await makeApp().request("/me", { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("expired");
  });

  it("accepts valid token and exposes payload via c.get('jwt') (200)", async () => {
    const tok = tokenFor({ tier: "pro", license_key: "AISEO-XXXX" });
    const res = await makeApp().request("/me", { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(200);
    const body = await res.json() as { tier: string; site_url: string; license_key: string };
    expect(body.tier).toBe("pro");
    expect(body.site_url).toBe("https://x");
    expect(body.license_key).toBe("AISEO-XXXX");
  });

  it("accepts token signed by JWT_SECRET_PREVIOUS during rotation", async () => {
    process.env.JWT_SECRET_PREVIOUS = PREV;
    try {
      const tok = tokenFor({ secret: PREV });
      const res = await makeApp().request("/me", { headers: { authorization: `Bearer ${tok}` } });
      expect(res.status).toBe(200);
    } finally {
      delete process.env.JWT_SECRET_PREVIOUS;
    }
  });

  it("returns 500 when JWT_SECRET is unset", async () => {
    const saved = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      const tok = signJwt(
        { site_url: "https://x", license_key: null, tier: "free", iat: 0, exp: Math.floor(Date.now() / 1000) + 3600 },
        { current: SECRET },
      );
      const res = await makeApp().request("/me", { headers: { authorization: `Bearer ${tok}` } });
      expect(res.status).toBe(500);
    } finally {
      process.env.JWT_SECRET = saved;
    }
  });

  it("accepts case-insensitive 'bearer' scheme", async () => {
    const tok = tokenFor();
    const res = await makeApp().request("/me", { headers: { authorization: `bearer ${tok}` } });
    expect(res.status).toBe(200);
  });
});
