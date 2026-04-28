import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { Hono } from "hono";
import { SQL } from "bun";
import { runMigrations } from "../lib/migrations";
import { mountLicenseWebhookRoute } from "../routes/license";
import { createWayForPayClient } from "../lib/billing/wayforpay-client";
import { createLicenseCache } from "../lib/license/cache";

const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!;
const SECRET = "test-merchant-secret";
const HMAC_SECRET = "test-hmac-32-bytes-for-license---";
const MIG_DIR = `${import.meta.dir}/../../migrations`;

describe("WayForPay webhook (initial purchase)", () => {
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
    const wfp = createWayForPayClient({ merchantAccount: "acct", merchantSecretKey: SECRET, merchantDomain: "example.com" });
    mountLicenseWebhookRoute(app, { sql, cache: createLicenseCache({ ttlMs: 60_000 }), wfpClient: wfp, licenseHmacSecret: HMAC_SECRET });
  });

  function signedBody(payload: any): { body: string; sig: string } {
    const fields = [payload.merchantAccount, payload.orderReference, payload.amount.toString(), payload.currency, payload.transactionStatus, payload.reasonCode?.toString() ?? ""];
    const wfp = createWayForPayClient({ merchantAccount: "acct", merchantSecretKey: SECRET, merchantDomain: "example.com" });
    const sig = wfp.computeWebhookSignature(fields);
    return { body: JSON.stringify({ ...payload, merchantSignature: sig }), sig };
  }

  it("rejects request with bad signature (401)", async () => {
    const payload = { merchantAccount: "acct", orderReference: "ord-1", amount: 19, currency: "USD", transactionStatus: "Approved", reasonCode: 1100, productName: "AI SEO Agent — Pro", recToken: "rec-1", cardPan: "411111****1111", clientEmail: "u@example.com", merchantSignature: "deadbeef".repeat(4) };
    const res = await app.request("/license/wayforpay-webhook", { method: "POST", body: JSON.stringify(payload), headers: { "content-type": "application/json" } });
    expect(res.status).toBe(401);
  });

  it("creates license row on Approved + Pro tier", async () => {
    const payload = { merchantAccount: "acct", orderReference: "ord-pro-1", amount: 19, currency: "USD", transactionStatus: "Approved", reasonCode: 1100, productName: "AI SEO Agent — Pro", recToken: "rec-pro-1", cardPan: "411111****1111", clientEmail: "u@example.com" };
    const { body } = signedBody(payload);
    const res = await app.request("/license/wayforpay-webhook", { method: "POST", body, headers: { "content-type": "application/json" } });
    expect(res.status).toBe(200);
    const rows = await sql`SELECT * FROM licenses WHERE wayforpay_order_reference = ${"ord-pro-1"}` as any[];
    expect(rows.length).toBe(1);
    expect(rows[0].tier).toBe("pro");
    expect(rows[0].max_sites).toBe(1);
    expect(rows[0].email).toBe("u@example.com");
    expect(rows[0].wayforpay_recurring_token).toBe("rec-pro-1");
    expect(rows[0].wayforpay_card_pan).toBe("411111****1111");
    expect(rows[0].next_charge_at).not.toBeNull();
    // next_charge_at sits 1 day before expires_at (29 days from now).
    const nextCharge = new Date(rows[0].next_charge_at).getTime();
    expect(nextCharge).toBeGreaterThan(Date.now() + 28 * 86400_000);
    expect(nextCharge).toBeLessThan(Date.now() + 30 * 86400_000);
  });

  it("falls back to null recToken/cardPan when WFP omits them", async () => {
    const payload = { merchantAccount: "acct", orderReference: "ord-norec", amount: 19, currency: "USD", transactionStatus: "Approved", reasonCode: 1100, productName: "AI SEO Agent — Pro", clientEmail: "u@x" };
    const { body } = signedBody(payload);
    await app.request("/license/wayforpay-webhook", { method: "POST", body, headers: { "content-type": "application/json" } });
    const rows = await sql`SELECT * FROM licenses WHERE wayforpay_order_reference = ${"ord-norec"}` as any[];
    expect(rows[0].wayforpay_recurring_token).toBeNull();
    expect(rows[0].wayforpay_card_pan).toBeNull();
  });

  it("creates license row with max_sites=5 on Agency tier", async () => {
    const payload = { merchantAccount: "acct", orderReference: "ord-agency", amount: 79, currency: "USD", transactionStatus: "Approved", reasonCode: 1100, productName: "AI SEO Agent — Agency", recToken: "rec-x", cardPan: "411111****2222", clientEmail: "agency@example.com" };
    const { body } = signedBody(payload);
    await app.request("/license/wayforpay-webhook", { method: "POST", body, headers: { "content-type": "application/json" } });
    const rows = await sql`SELECT max_sites FROM licenses WHERE wayforpay_order_reference = ${"ord-agency"}` as any[];
    expect(rows[0].max_sites).toBe(5);
  });

  it("on Refunded, marks existing license disabled", async () => {
    await sql`INSERT INTO licenses (key, tier, max_sites, expires_at, wayforpay_order_reference) VALUES ('seo_TESTKEY_AAAA', 'pro', 1, NOW() + INTERVAL '30 days', 'ord-rf')`;
    const payload = { merchantAccount: "acct", orderReference: "ord-rf", amount: 19, currency: "USD", transactionStatus: "Refunded", reasonCode: 1100, productName: "AI SEO Agent — Pro" };
    const { body } = signedBody(payload);
    const res = await app.request("/license/wayforpay-webhook", { method: "POST", body, headers: { "content-type": "application/json" } });
    expect(res.status).toBe(200);
    const rows = await sql`SELECT status, disabled_reason FROM licenses WHERE wayforpay_order_reference = ${"ord-rf"}` as any[];
    expect(rows[0].status).toBe("disabled");
    expect(rows[0].disabled_reason).toBe("refunded");
  });
});
