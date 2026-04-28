import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { Hono } from "hono";
import { SQL } from "bun";
import { runMigrations } from "../lib/migrations";
import { mountLicenseRoutes } from "../routes/license";
import { createLicenseCache } from "../lib/license/cache";
import { generateKey } from "../lib/license/key-format";
import { signJwt } from "../lib/jwt";

const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!;
const SECRET = "test-secret-32-bytes-for-hmac----";
const JWT_SECRET = "test-jwt-secret-32-bytes-min-pls!";
const MIG_DIR = `${import.meta.dir}/../../migrations`;

function bearerFor(licenseKey: string | null, tier: "free" | "pro" = "pro"): string {
  const now = Math.floor(Date.now() / 1000);
  return `Bearer ${signJwt(
    { site_url: "https://x", license_key: licenseKey, tier, iat: now, exp: now + 3600 },
    { current: JWT_SECRET },
  )}`;
}

describe("license routes", () => {
  let sql: SQL;
  let app: Hono;

  beforeAll(async () => {
    process.env.JWT_SECRET ??= JWT_SECRET;
    sql = new SQL(TEST_DB_URL);
    await sql`DROP TABLE IF EXISTS session_messages, sessions, licenses, migrations CASCADE`;
    await runMigrations(sql, MIG_DIR);
  });
  afterAll(async () => { await sql.close(); });
  beforeEach(async () => {
    await sql`DELETE FROM licenses`;
    app = new Hono();
    mountLicenseRoutes(app, { sql, cache: createLicenseCache({ ttlMs: 60_000 }), licenseHmacSecret: SECRET });
  });

  it("GET /license/<key>/verify returns 404 for unknown key", async () => {
    const res = await app.request("/license/seo_BOGUS_AAAA/verify");
    expect(res.status).toBe(404);
  });

  it("GET /license/<key>/verify returns row for valid active key", async () => {
    const { key } = generateKey({ tier: "pro", expirySeconds: 30*86400, secret: SECRET });
    await sql`INSERT INTO licenses (key, tier, max_sites, expires_at) VALUES (${key}, 'pro', 1, NOW() + INTERVAL '30 days')`;
    const res = await app.request(`/license/${key}/verify`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.tier).toBe("pro");
    expect(body.status).toBe("active");
  });

  it("GET /license/<key>/verify returns 403 for disabled key", async () => {
    const { key } = generateKey({ tier: "pro", expirySeconds: 86400, secret: SECRET });
    await sql`INSERT INTO licenses (key, tier, max_sites, expires_at, status) VALUES (${key}, 'pro', 1, NOW() + INTERVAL '1 day', 'disabled')`;
    const res = await app.request(`/license/${key}/verify`);
    expect(res.status).toBe(403);
  });

  it("POST /license/<key>/cancel marks license cancelled but keeps active until expiry", async () => {
    const { key } = generateKey({ tier: "pro", expirySeconds: 86400, secret: SECRET });
    await sql`INSERT INTO licenses (key, tier, max_sites, expires_at) VALUES (${key}, 'pro', 1, NOW() + INTERVAL '5 days')`;
    const res = await app.request(`/license/${key}/cancel`, { method: "POST", headers: { authorization: bearerFor(key) } });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.cancelled).toBe(true);
    const rows = await sql`SELECT status, recurring_state, cancelled_at, disabled_reason FROM licenses WHERE key = ${key}`;
    expect(rows[0].status).toBe("active");
    expect(rows[0].recurring_state).toBe("cancelled");
    expect(rows[0].cancelled_at).not.toBeNull();
    expect(rows[0].disabled_reason).toBe("user_cancelled");
  });

  it("POST /license/<key>/cancel rejects without JWT (401)", async () => {
    const { key } = generateKey({ tier: "pro", expirySeconds: 86400, secret: SECRET });
    await sql`INSERT INTO licenses (key, tier, max_sites, expires_at) VALUES (${key}, 'pro', 1, NOW() + INTERVAL '5 days')`;
    const res = await app.request(`/license/${key}/cancel`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("POST /license/<key>/cancel rejects when JWT.license_key does not match path key (403)", async () => {
    const { key: keyA } = generateKey({ tier: "pro", expirySeconds: 86400, secret: SECRET });
    const { key: keyB } = generateKey({ tier: "pro", expirySeconds: 86400, secret: SECRET });
    await sql`INSERT INTO licenses (key, tier, max_sites, expires_at) VALUES (${keyA}, 'pro', 1, NOW() + INTERVAL '5 days')`;
    const res = await app.request(`/license/${keyA}/cancel`, { method: "POST", headers: { authorization: bearerFor(keyB) } });
    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body.error).toBe("license_mismatch");
  });

  it("POST /license/<key>/cancel rejects free-tier JWT (license_key=null) (403)", async () => {
    const { key } = generateKey({ tier: "pro", expirySeconds: 86400, secret: SECRET });
    await sql`INSERT INTO licenses (key, tier, max_sites, expires_at) VALUES (${key}, 'pro', 1, NOW() + INTERVAL '5 days')`;
    const res = await app.request(`/license/${key}/cancel`, { method: "POST", headers: { authorization: bearerFor(null, "free") } });
    expect(res.status).toBe(403);
  });

  it("GET /license/<key>/details returns rich row to matching JWT", async () => {
    const { key } = generateKey({ tier: "pro", expirySeconds: 30 * 86400, secret: SECRET });
    await sql`
      INSERT INTO licenses (key, tier, max_sites, expires_at, next_charge_at, wayforpay_card_pan)
      VALUES (${key}, 'pro', 1, NOW() + INTERVAL '30 days', NOW() + INTERVAL '29 days', '411111****1234')
    `;
    const res = await app.request(`/license/${key}/details`, { headers: { authorization: bearerFor(key) } });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.tier).toBe("pro");
    expect(body.recurring_state).toBe("active");
    expect(body.card_last4).toBe("1234");
    expect(body.next_charge_at).not.toBeNull();
  });

  it("GET /license/<key>/details rejects mismatched JWT (403)", async () => {
    const { key: keyA } = generateKey({ tier: "pro", expirySeconds: 30 * 86400, secret: SECRET });
    const { key: keyB } = generateKey({ tier: "pro", expirySeconds: 30 * 86400, secret: SECRET });
    await sql`INSERT INTO licenses (key, tier, max_sites, expires_at) VALUES (${keyA}, 'pro', 1, NOW() + INTERVAL '30 days')`;
    const res = await app.request(`/license/${keyA}/details`, { headers: { authorization: bearerFor(keyB) } });
    expect(res.status).toBe(403);
  });

  it("GET /license/<key>/details rejects without JWT (401)", async () => {
    const { key } = generateKey({ tier: "pro", expirySeconds: 30 * 86400, secret: SECRET });
    await sql`INSERT INTO licenses (key, tier, max_sites, expires_at) VALUES (${key}, 'pro', 1, NOW() + INTERVAL '30 days')`;
    const res = await app.request(`/license/${key}/details`);
    expect(res.status).toBe(401);
  });

  it("GET /license/<key>/verify returns 404 not_found for valid HMAC but missing DB row", async () => {
    const { key } = generateKey({ tier: "pro", expirySeconds: 86400, secret: SECRET });
    // Do NOT insert into licenses
    const res = await app.request(`/license/${key}/verify`);
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toBe("not_found");
  });

  it("GET /license/<key>/verify returns 403 license_expired for HMAC-signed-past-expiry key", async () => {
    // Sign a key whose embedded expiry is already past
    const { key } = generateKey({ tier: "pro", expirySeconds: -10, secret: SECRET });
    // Even with a valid (future-dated) DB row, the signed expiry must reject
    await sql`INSERT INTO licenses (key, tier, max_sites, expires_at) VALUES (${key}, 'pro', 1, NOW() + INTERVAL '30 days')`;
    const res = await app.request(`/license/${key}/verify`);
    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body.error).toBe("license_expired");
  });
});
