import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { Hono } from "hono";
import { SQL } from "bun";
import { runMigrations } from "../lib/migrations";
import { mountAuthTokenRoute } from "../routes/auth";
import { createLicenseCache } from "../lib/license/cache";
import { generateKey } from "../lib/license/key-format";
import { verifyJwt } from "../lib/jwt";

const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!;
const HMAC_SECRET = "test-secret-32-bytes-for-hmac----";
const JWT_SECRET  = "test-jwt-secret-32-bytes-min-pls!";
const SHARED      = "test-shared-secret";
const MIG_DIR = `${import.meta.dir}/../../migrations`;

const prevEnv: Record<string, string | undefined> = {};

describe("POST /auth/token", () => {
  let sql: SQL;
  let app: Hono;

  beforeAll(async () => {
    prevEnv.SHARED_SECRET = process.env.SHARED_SECRET;
    prevEnv.JWT_SECRET    = process.env.JWT_SECRET;
    process.env.SHARED_SECRET = SHARED;
    process.env.JWT_SECRET    = JWT_SECRET;

    sql = new SQL(TEST_DB_URL);
    await sql`DROP TABLE IF EXISTS session_messages, sessions, licenses, migrations CASCADE`;
    await runMigrations(sql, MIG_DIR);
  });
  afterAll(async () => {
    if (prevEnv.SHARED_SECRET === undefined) delete process.env.SHARED_SECRET; else process.env.SHARED_SECRET = prevEnv.SHARED_SECRET;
    if (prevEnv.JWT_SECRET    === undefined) delete process.env.JWT_SECRET;    else process.env.JWT_SECRET    = prevEnv.JWT_SECRET;
    await sql.close();
  });
  beforeEach(async () => {
    await sql`DELETE FROM licenses`;
    app = new Hono();
    mountAuthTokenRoute(app, {
      sql,
      cache: createLicenseCache({ ttlMs: 60_000 }),
      licenseHmacSecret: HMAC_SECRET,
      tokenTtlSeconds: 3600,
    });
  });

  function call(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
    return Promise.resolve(app.request("/auth/token", {
      method: "POST",
      headers: { "content-type": "application/json", "x-shared-secret": SHARED, ...headers },
      body: JSON.stringify(body),
    }));
  }

  it("rejects without shared secret (401)", async () => {
    const res = await app.request("/auth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ license_key: null, site_url: "https://x" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects missing site_url (400)", async () => {
    const res = await call({ license_key: null });
    expect(res.status).toBe(400);
  });

  it("mints free-tier JWT when license_key is null", async () => {
    const res = await call({ license_key: null, site_url: "https://x" });
    expect(res.status).toBe(200);
    const body = await res.json() as { token: string; tier: string; expires_at: string };
    expect(body.tier).toBe("free");
    const verified = verifyJwt(body.token, { current: JWT_SECRET });
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.payload.tier).toBe("free");
      expect(verified.payload.license_key).toBeNull();
      expect(verified.payload.site_url).toBe("https://x");
    }
  });

  it("mints JWT with embedded tier for valid active license", async () => {
    const { key } = generateKey({ tier: "pro", expirySeconds: 30*86400, secret: HMAC_SECRET });
    await sql`INSERT INTO licenses (key, tier, max_sites, expires_at) VALUES (${key}, 'pro', 1, NOW() + INTERVAL '30 days')`;

    const res = await call({ license_key: key, site_url: "https://x" });
    expect(res.status).toBe(200);
    const body = await res.json() as { token: string; tier: string };
    expect(body.tier).toBe("pro");
    const verified = verifyJwt(body.token, { current: JWT_SECRET });
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.payload.tier).toBe("pro");
      expect(verified.payload.license_key).toBe(key);
    }
  });

  it("respects tokenTtlSeconds — exp ≈ now + ttl", async () => {
    const before = Math.floor(Date.now() / 1000);
    const res = await call({ license_key: null, site_url: "https://x" });
    const body = await res.json() as { token: string };
    const verified = verifyJwt(body.token, { current: JWT_SECRET });
    if (!verified.ok) throw new Error("expected ok");
    expect(verified.payload.exp).toBeGreaterThanOrEqual(before + 3600 - 2);
    expect(verified.payload.exp).toBeLessThanOrEqual(before + 3600 + 2);
  });

  it("returns 404 for HMAC-invalid license_key", async () => {
    const res = await call({ license_key: "seo_BOGUS_AAAA", site_url: "https://x" });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("invalid_key_format");
  });

  it("returns 403 for HMAC-signed expired license_key", async () => {
    const { key } = generateKey({ tier: "pro", expirySeconds: -10, secret: HMAC_SECRET });
    const res = await call({ license_key: key, site_url: "https://x" });
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("license_expired");
  });

  it("returns 404 for HMAC-valid key with no DB row", async () => {
    const { key } = generateKey({ tier: "pro", expirySeconds: 30*86400, secret: HMAC_SECRET });
    const res = await call({ license_key: key, site_url: "https://x" });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("not_found");
  });

  it("returns 403 for disabled license (status != active)", async () => {
    const { key } = generateKey({ tier: "pro", expirySeconds: 30*86400, secret: HMAC_SECRET });
    await sql`INSERT INTO licenses (key, tier, max_sites, expires_at, status) VALUES (${key}, 'pro', 1, NOW() + INTERVAL '30 days', 'disabled')`;
    const res = await call({ license_key: key, site_url: "https://x" });
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string; status: string };
    expect(body.error).toBe("license_disabled");
  });
});
