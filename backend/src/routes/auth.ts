import type { Hono } from "hono";
import type { SQL } from "bun";
import { signJwt } from "../lib/jwt";
import type { LicenseCache } from "../lib/license/cache";
import { parseKey, type Tier } from "../lib/license/key-format";
import { makeRateLimit } from "../lib/rate-limit";

export type AuthTokenDeps = {
  sql: SQL;
  cache: LicenseCache;
  licenseHmacSecret: string;
  /** JWT lifetime in seconds. Plugin should refresh ahead of expiry. */
  tokenTtlSeconds: number;
  /** Max mints per minute per IP. Defaults to 10 — a legit plugin mints once
   *  per JWT_TOKEN_TTL_SECONDS (default 24h), so 10/min is far above honest use. */
  rateLimitPerMin?: number;
};

type Body = { license_key?: string | null; site_url?: string };

export function mountAuthTokenRoute(app: Hono, deps: AuthTokenDeps): void {
  const rateLimit = makeRateLimit({ perMin: deps.rateLimitPerMin ?? 10 });
  app.use("/auth/token", rateLimit);
  app.post("/auth/token", async c => {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return c.json({ error: "server misconfigured: JWT_SECRET unset" }, 500);

    let body: Body;
    try { body = await c.req.json() as Body; }
    catch { return c.json({ error: "invalid_json" }, 400); }

    const siteUrl = typeof body.site_url === "string" ? body.site_url.trim() : "";
    if (!siteUrl) return c.json({ error: "missing_site_url" }, 400);

    const licenseKey = body.license_key ?? null;
    let tier: Tier = "free";

    if (licenseKey !== null) {
      if (typeof licenseKey !== "string") return c.json({ error: "invalid_key_format" }, 404);
      const parsed = parseKey(licenseKey, deps.licenseHmacSecret);
      if (!parsed.ok) return c.json({ error: "invalid_key_format" }, 404);
      if (parsed.expired) return c.json({ error: "license_expired" }, 403);

      const cached = await deps.cache.lookup(licenseKey, async () => {
        const rows = await deps.sql`SELECT tier, expires_at FROM licenses WHERE key = ${licenseKey}` as Array<{ tier: string; expires_at: string }>;
        const row = rows[0];
        if (!row) return null;
        return { tier: row.tier as Tier, expiresAt: new Date(row.expires_at).getTime() };
      });
      if (!cached) return c.json({ error: "not_found" }, 404);

      const statusRow = await deps.sql`SELECT status FROM licenses WHERE key = ${licenseKey}` as Array<{ status: string }>;
      const status = statusRow[0]?.status ?? "disabled";
      if (status !== "active") return c.json({ error: "license_disabled", status }, 403);

      tier = cached.tier;
    }

    const now = Math.floor(Date.now() / 1000);
    const exp = now + deps.tokenTtlSeconds;
    const previous = process.env.JWT_SECRET_PREVIOUS;
    const token = signJwt(
      { site_url: siteUrl, license_key: licenseKey, tier, iat: now, exp },
      previous ? { current: jwtSecret, previous } : { current: jwtSecret },
    );

    return c.json({ token, tier, expires_at: new Date(exp * 1000).toISOString() });
  });
}
