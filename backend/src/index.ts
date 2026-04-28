import { Hono } from "hono";
import { mountChat } from "./routes/chat";
import { mountHealth } from "./routes/health";
import { mountLicenseRoutes, mountLicenseWebhookRoute } from "./routes/license";
import { mountAuthTokenRoute } from "./routes/auth";
import { createLicenseCache } from "./lib/license/cache";
import { createSessionStore } from "./lib/sessions";
import { createWpClient } from "./lib/wp-client";
import { tools } from "./lib/tools";
import { createAnthropicClient } from "./lib/anthropic-client";
import { runMigrations } from "./lib/migrations";
import { getDb } from "./lib/db";
import { createWayForPayClient } from "./lib/billing/wayforpay-client";

export const app = new Hono();
mountHealth(app);

const wpBaseUrl = process.env.WP_BASE_URL;
if (!wpBaseUrl) {
  throw new Error("WP_BASE_URL is required (e.g. https://www.seo-friendly.org)");
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required (e.g. postgres://seoagent:***@127.0.0.1:5432/seoagent)");
}
const licenseHmacSecret = process.env.LICENSE_HMAC_SECRET;
if (!licenseHmacSecret) {
  throw new Error("LICENSE_HMAC_SECRET is required (32+ random chars; signs license keys)");
}
const wfpMerchantAccount = process.env.WAYFORPAY_MERCHANT_ACCOUNT;
if (!wfpMerchantAccount) {
  throw new Error("WAYFORPAY_MERCHANT_ACCOUNT is required (matches the merchant account configured in the WFP dashboard)");
}
const wfpMerchantSecretKey = process.env.WAYFORPAY_MERCHANT_SECRET_KEY;
if (!wfpMerchantSecretKey) {
  throw new Error("WAYFORPAY_MERCHANT_SECRET_KEY is required (HMAC-MD5 secret for webhook verification + chargeRecurring)");
}
const wfpDomain = process.env.WAYFORPAY_DOMAIN;
if (!wfpDomain) {
  throw new Error("WAYFORPAY_DOMAIN is required (merchant domain registered with WFP, e.g. www.seo-friendly.org)");
}
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error("JWT_SECRET is required (32+ random chars; signs auth tokens + service tokens)");
}
const wp = createWpClient({
  baseUrl:   wpBaseUrl,
  jwtSecret,
});
const sessionStore = createSessionStore(getDb());

mountChat(app, {
  makeClient: (apiKey) => createAnthropicClient(apiKey),
  sessionStore,
  wp,
  tools,
});

const licenseCache = createLicenseCache({ ttlMs: 60_000 });
mountLicenseRoutes(app, { sql: getDb(), cache: licenseCache, licenseHmacSecret });

const tokenTtlSeconds = Number(process.env.JWT_TOKEN_TTL_SECONDS ?? 86400);
mountAuthTokenRoute(app, {
  sql: getDb(),
  cache: licenseCache,
  licenseHmacSecret,
  tokenTtlSeconds,
});

const wfpClient = createWayForPayClient({
  merchantAccount:   wfpMerchantAccount,
  merchantSecretKey: wfpMerchantSecretKey,
  merchantDomain:    wfpDomain,
});
mountLicenseWebhookRoute(app, {
  sql: getDb(),
  cache: licenseCache,
  wfpClient,
  licenseHmacSecret,
});

if (import.meta.main) {
  // Apply any pending migrations before serving traffic.
  await runMigrations(getDb(), `${import.meta.dir}/../migrations`);

  const port = Number(process.env.PORT ?? 8787);
  Bun.serve({ port, fetch: app.fetch, idleTimeout: 255 });
  console.log(`backend listening on :${port}`);

  // One-shot sweep on startup: any 'running' job with stale last_progress_at
  // is from a previous backend process and will never resume. Mark them
  // 'interrupted' so the polling UI shows a clean terminal state instead of
  // perpetual "running". Best-effort — log and move on if WP isn't reachable.
  wp.sweepInterruptedJobs(5)
    .then(r => { if (r.interrupted > 0) console.log(`startup sweep: marked ${r.interrupted} stale running job(s) as interrupted`); })
    .catch(err => console.error("startup sweep failed:", err instanceof Error ? err.message : String(err)));

  // Sessions retention: prune anything older than SESSION_RETENTION_DAYS (default 90).
  // Runs once 5 minutes after startup, then every 24 hours.
  const retentionDays = Number(process.env.SESSION_RETENTION_DAYS ?? 90);
  const runRetentionPrune = async () => {
    try {
      const deleted = await sessionStore.pruneOlderThan(retentionDays);
      if (deleted > 0) console.log(`[sessions] pruned ${deleted} stale session(s) older than ${retentionDays} days`);
    } catch (err) {
      console.error("[sessions] retention prune failed:", err instanceof Error ? err.message : String(err));
    }
  };
  setTimeout(() => {
    void runRetentionPrune();
    setInterval(() => { void runRetentionPrune(); }, 24 * 60 * 60 * 1000);
  }, 5 * 60 * 1000);
}
