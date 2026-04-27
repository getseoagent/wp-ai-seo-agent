import type { Hono } from "hono";
import type { SQL } from "bun";
import type { LicenseCache } from "../lib/license/cache";
import { parseKey, type Tier } from "../lib/license/key-format";

export type LicenseRouteDeps = {
  sql: SQL;
  cache: LicenseCache;
  licenseHmacSecret: string;
};

/**
 * Mounts /license/{key}/verify and /license/{key}/cancel.
 * /license/wayforpay-webhook is mounted by mountLicenseWebhookRoute (Task 2.8).
 */
export function mountLicenseRoutes(app: Hono, deps: LicenseRouteDeps): void {
  app.get("/license/:key/verify", async c => {
    const key = c.req.param("key");
    const parsed = parseKey(key, deps.licenseHmacSecret);
    if (!parsed.ok) return c.json({ error: "invalid_key_format" }, 404);
    if (parsed.expired) return c.json({ error: "license_expired" }, 403);

    const cached = await deps.cache.lookup(key, async () => {
      const rows = await deps.sql`SELECT tier, expires_at FROM licenses WHERE key = ${key}` as Array<{ tier: string; expires_at: string }>;
      const row = rows[0];
      if (!row) return null;
      return { tier: row.tier as Tier, expiresAt: new Date(row.expires_at).getTime() };
    });
    if (!cached) return c.json({ error: "not_found" }, 404);

    const statusRow = await deps.sql`SELECT status FROM licenses WHERE key = ${key}` as Array<{ status: string }>;
    const status = statusRow[0]?.status ?? "disabled";
    if (status !== "active") return c.json({ error: "license_disabled", status }, 403);

    return c.json({ key, status, tier: cached.tier, expires_at: new Date(cached.expiresAt).toISOString() });
  });

  // TODO(Task 3.x): gate behind JWT auth-middleware. Currently public — DO NOT
  // promote to prod until JWT middleware lands; anyone who knows a license key
  // could flag it for cancellation otherwise.
  app.post("/license/:key/cancel", async c => {
    const key = c.req.param("key");
    await deps.sql`UPDATE licenses SET disabled_reason = 'user_cancelled' WHERE key = ${key}`;
    deps.cache.invalidate(key);
    return c.json({ cancelled: true });
  });
}
