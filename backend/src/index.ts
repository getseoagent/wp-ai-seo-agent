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
import { startBillingWorker } from "./lib/billing/billing-worker";
import { sendTransactionalEmail } from "./lib/billing/emails/transport";
import { renderEmail } from "./lib/billing/emails";
import type { Tier } from "./lib/license/key-format";

export const app = new Hono();
mountHealth(app);

const MIN_SECRET_LEN = 32;
function requireEnv(name: string, hint: string, opts: { minLen?: number } = {}): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required (${hint})`);
  if (opts.minLen && v.length < opts.minLen) {
    throw new Error(`${name} too short (got ${v.length} chars, need ${opts.minLen}+) — ${hint}`);
  }
  return v;
}

const wpBaseUrl           = requireEnv("WP_BASE_URL",                   "e.g. https://www.seo-friendly.org");
const databaseUrl         = requireEnv("DATABASE_URL",                  "e.g. postgres://seoagent:***@127.0.0.1:5432/seoagent");
const licenseHmacSecret   = requireEnv("LICENSE_HMAC_SECRET",           "32+ random chars; signs license keys",                                       { minLen: MIN_SECRET_LEN });
const wfpMerchantAccount  = requireEnv("WAYFORPAY_MERCHANT_ACCOUNT",    "matches the merchant account configured in the WFP dashboard");
const wfpMerchantSecretKey = requireEnv("WAYFORPAY_MERCHANT_SECRET_KEY", "32+ chars; HMAC-MD5 secret for webhook + chargeRecurring",                  { minLen: MIN_SECRET_LEN });
const wfpDomain           = requireEnv("WAYFORPAY_DOMAIN",              "merchant domain registered with WFP, e.g. www.seo-friendly.org");
const jwtSecret           = requireEnv("JWT_SECRET",                    "32+ random chars; signs user + service JWTs",                                { minLen: MIN_SECRET_LEN });
void databaseUrl;
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
  sendEmail: (kind, license) => sendTransactionalEmail(kind, license, renderEmail),
});

// Pricing for the recurring billing worker. Free is never charged — included
// so the Tier-keyed lookup is total. Update on tier-price changes; existing
// licenses keep their original price unless a re-purchase flows through the
// WFP webhook.
const TIER_PRICES: Record<Tier, number> = { free: 0, pro: 19, agency: 79, enterprise: 299 };
const billingWorker = startBillingWorker({
  sql:             getDb(),
  chargeRecurring: wfpClient.chargeRecurring.bind(wfpClient),
  sendEmail:       (kind, license) => sendTransactionalEmail(kind, license, renderEmail),
  amountForTier:   tier => TIER_PRICES[tier],
  currency:        process.env.BILLING_CURRENCY ?? "USD",
});
process.on("SIGTERM", () => billingWorker.stop());

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
