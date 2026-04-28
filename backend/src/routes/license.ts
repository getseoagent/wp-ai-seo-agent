import type { Hono } from "hono";
import type { SQL } from "bun";
import type { LicenseCache } from "../lib/license/cache";
import { generateKey, parseKey, type Tier } from "../lib/license/key-format";
import type { WayForPayClient } from "../lib/billing/wayforpay-client";
import { requireJwt } from "../lib/auth";
import type { JwtPayload } from "../lib/jwt";

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

  app.use("/license/:key/cancel", requireJwt);
  app.post("/license/:key/cancel", async c => {
    const key = c.req.param("key");
    const jwt = c.get("jwt" as never) as JwtPayload;
    if (jwt.license_key !== key) {
      return c.json({ error: "license_mismatch" }, 403);
    }
    // Stop the auto-renewal *and* record the cancellation timestamp; status
    // stays 'active' so the customer keeps access until expires_at.
    await deps.sql`
      UPDATE licenses
         SET recurring_state = 'cancelled',
             cancelled_at    = NOW(),
             disabled_reason = 'user_cancelled'
       WHERE key = ${key}
    `;
    deps.cache.invalidate(key);
    return c.json({ cancelled: true });
  });

  // Richer status for the plugin's Subscription tab. Same JWT + license_key
  // match guard as /cancel — only the customer who minted the token can see
  // their own card last-4 + next-charge date.
  app.use("/license/:key/details", requireJwt);
  app.get("/license/:key/details", async c => {
    const key = c.req.param("key");
    const jwt = c.get("jwt" as never) as JwtPayload;
    if (jwt.license_key !== key) {
      return c.json({ error: "license_mismatch" }, 403);
    }
    const rows = await deps.sql`
      SELECT key, status, tier, expires_at, recurring_state, next_charge_at,
             wayforpay_card_pan, cancelled_at
        FROM licenses
       WHERE key = ${key}
    ` as Array<{
      key: string; status: string; tier: string;
      expires_at: string; recurring_state: string;
      next_charge_at: string | null; wayforpay_card_pan: string | null;
      cancelled_at: string | null;
    }>;
    const row = rows[0];
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json({
      key:             row.key,
      status:          row.status,
      tier:            row.tier,
      expires_at:      row.expires_at,
      recurring_state: row.recurring_state,
      next_charge_at:  row.next_charge_at,
      card_last4:      row.wayforpay_card_pan ? row.wayforpay_card_pan.slice(-4) : null,
      cancelled_at:    row.cancelled_at,
    });
  });
}

export type WebhookDeps = {
  sql: SQL;
  cache: LicenseCache;
  wfpClient: WayForPayClient;
  licenseHmacSecret: string;
  /** Optional emitter for the license-issued transactional email. Null in tests. */
  sendEmail?: (kind: "license-issued", license: { key: string; email: string | null; tier: Tier }) => Promise<void>;
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

      // recToken from the first successful charge enables monthly auto-renewal
      // by the billing worker (Task 4.3). cardPan is the masked PAN we surface
      // in the plugin's Subscription tab. Both are nullable — WFP omits them on
      // some merchant configs, in which case the worker just won't auto-renew.
      const recToken: string | null = typeof payload.recToken === "string" ? payload.recToken : null;
      const cardPan:  string | null = typeof payload.cardPan  === "string" ? payload.cardPan  : null;

      await deps.sql`
        INSERT INTO licenses (
          key, status, tier, max_sites, email,
          wayforpay_order_reference,
          wayforpay_recurring_token,
          wayforpay_card_pan,
          expires_at,
          next_charge_at
        ) VALUES (
          ${key}, 'active', ${productMapping.tier}, ${productMapping.maxSites},
          ${payload.clientEmail ?? null}, ${orderRef},
          ${recToken}, ${cardPan},
          NOW() + INTERVAL '30 days',
          NOW() + INTERVAL '29 days'
        )
      `;

      if (deps.sendEmail && payload.clientEmail) {
        try {
          await deps.sendEmail("license-issued", { key, email: payload.clientEmail, tier: productMapping.tier });
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
