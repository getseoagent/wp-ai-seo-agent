import type { Hono } from "hono";
import type { SQL } from "bun";
import type { LicenseCache } from "../lib/license/cache";
import { generateKey, parseKey, type Tier } from "../lib/license/key-format";
import type { WayForPayClient } from "../lib/billing/wayforpay-client";

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

export type WebhookDeps = {
  sql: SQL;
  cache: LicenseCache;
  wfpClient: WayForPayClient;
  licenseHmacSecret: string;
  /** Optional email sender for license-issued template; null in tests. */
  sendLicenseIssuedEmail?: (to: string, key: string, tier: Tier) => Promise<void>;
};

const PRODUCT_TO_TIER: Record<string, { tier: Tier; maxSites: number }> = {
  "AI SEO Agent — Pro":        { tier: "pro",        maxSites: 1 },
  "AI SEO Agent — Agency":     { tier: "agency",     maxSites: 5 },
  "AI SEO Agent — Enterprise": { tier: "enterprise", maxSites: 999 },
};

/**
 * Mounts POST /license/wayforpay-webhook.
 *
 * WFP posts JSON to this endpoint after the customer completes checkout (or
 * when a chargeback/refund/void is processed). We HMAC-verify the signature
 * (constant-time compare in wfpClient.verifyWebhookSignature) before doing any
 * DB work, then dispatch by transactionStatus:
 *
 * - Approved → idempotent on orderReference; create license row + signed key,
 *   optionally send the license-issued email. Unknown productName → log + 200
 *   ignored:true (don't 4xx so WFP doesn't retry-storm us; admin reviews logs).
 * - Refunded / Voided → mark existing license disabled with disabled_reason +
 *   invalidate cache so verify hits the new disabled state immediately.
 * - Other statuses (Pending, Declined, etc.) → log + 200; nothing to do.
 *
 * Always returns 200 on a valid signature; non-200 only on signature failure
 * or transport-level errors (let WFP retry those).
 */
export function mountLicenseWebhookRoute(app: Hono, deps: WebhookDeps): void {
  app.post("/license/wayforpay-webhook", async c => {
    let payload: any;
    try {
      payload = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    if (!payload || typeof payload !== "object") {
      return c.json({ error: "invalid_payload" }, 400);
    }

    const fields = [
      payload.merchantAccount ?? "",
      payload.orderReference ?? "",
      String(payload.amount ?? ""),
      payload.currency ?? "",
      payload.transactionStatus ?? "",
      String(payload.reasonCode ?? ""),
    ];
    if (typeof payload.merchantSignature !== "string" || !deps.wfpClient.verifyWebhookSignature(fields, payload.merchantSignature)) {
      return c.json({ error: "invalid_signature" }, 401);
    }

    const status = payload.transactionStatus as string;
    const orderRef = payload.orderReference as string;

    if (status === "Approved") {
      const existing = await deps.sql`SELECT key FROM licenses WHERE wayforpay_order_reference = ${orderRef}` as any[];
      if (existing.length > 0) {
        return c.json({ ok: true, idempotent: true });
      }

      const productMapping = PRODUCT_TO_TIER[payload.productName];
      if (!productMapping) {
        console.warn(`[wfp-webhook] unknown productName: ${payload.productName}`);
        return c.json({ ok: true, ignored: true });
      }

      const { key } = generateKey({
        tier: productMapping.tier,
        expirySeconds: 30 * 86400,
        secret: deps.licenseHmacSecret,
      });

      await deps.sql`
        INSERT INTO licenses (
          key, status, tier, max_sites, email,
          wayforpay_order_reference,
          expires_at
        ) VALUES (
          ${key}, 'active', ${productMapping.tier}, ${productMapping.maxSites},
          ${payload.clientEmail ?? null}, ${orderRef},
          NOW() + INTERVAL '30 days'
        )
      `;

      if (deps.sendLicenseIssuedEmail && payload.clientEmail) {
        try {
          await deps.sendLicenseIssuedEmail(payload.clientEmail, key, productMapping.tier);
        } catch (err) {
          console.error("[wfp-webhook] license-issued email failed:", err);
        }
      }

      return c.json({ ok: true, key });
    }

    if (status === "Refunded" || status === "Voided") {
      await deps.sql`
        UPDATE licenses
           SET status = 'disabled',
               disabled_at = NOW(),
               disabled_reason = ${status === "Refunded" ? "refunded" : "voided"}
         WHERE wayforpay_order_reference = ${orderRef}
      `;
      const rows = await deps.sql`SELECT key FROM licenses WHERE wayforpay_order_reference = ${orderRef}` as any[];
      if (rows[0]?.key) deps.cache.invalidate(rows[0].key);
      return c.json({ ok: true });
    }

    console.log(`[wfp-webhook] non-actionable status: ${status} for ${orderRef}`);
    return c.json({ ok: true, status });
  });
}
