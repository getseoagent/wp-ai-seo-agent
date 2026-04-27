import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { Hono } from "hono";
import { SQL } from "bun";
import { runMigrations } from "../lib/migrations";
import { mountLicenseRoutes } from "../routes/license";
import { createLicenseCache } from "../lib/license/cache";
import { generateKey } from "../lib/license/key-format";

const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!;
const SECRET = "test-secret-32-bytes-for-hmac----";
const MIG_DIR = `${import.meta.dir}/../../migrations`;

describe("license routes", () => {
  let sql: SQL;
  let app: Hono;

  beforeAll(async () => {
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
    const res = await app.request(`/license/${key}/cancel`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.cancelled).toBe(true);
    const rows = await sql`SELECT status, disabled_reason FROM licenses WHERE key = ${key}`;
    expect(rows[0].status).toBe("active");
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
