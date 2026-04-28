import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { SQL } from "bun";
import { runMigrations } from "../lib/migrations";
import { tickOnce, type EmailKind, type TickDeps } from "../lib/billing/billing-worker";
import type { ChargeArgs, ChargeResult } from "../lib/billing/wayforpay-client";
import type { Tier } from "../lib/license/key-format";

import { testDbUrl } from "./_helpers/test-db";
const TEST_DB_URL = testDbUrl();
const MIG_DIR = `${import.meta.dir}/../../migrations`;

type EmailCall = { kind: EmailKind; key: string; tier: Tier };
type ChargeCall = ChargeArgs;

function makeDeps(opts: {
  chargeResult?: (args: ChargeArgs) => ChargeResult;
  charges?: ChargeCall[];
  emails?: EmailCall[];
  amountForTier?: (t: Tier) => number;
  sql: SQL;
}): TickDeps {
  return {
    sql: opts.sql,
    chargeRecurring: async args => {
      opts.charges?.push(args);
      return opts.chargeResult ? opts.chargeResult(args) : { transactionStatus: "Approved", rawBody: {} };
    },
    sendEmail: async (kind, license) => {
      opts.emails?.push({ kind, key: license.key, tier: license.tier });
    },
    amountForTier: opts.amountForTier ?? (() => 19),
    currency: "USD",
  };
}

describe("billing-worker tickOnce", () => {
  let sql: SQL;
  beforeAll(async () => {
    sql = new SQL(TEST_DB_URL);
    await sql`DROP TABLE IF EXISTS session_messages, sessions, licenses, migrations CASCADE`;
    await runMigrations(sql, MIG_DIR);
  });
  afterAll(async () => { await sql.close(); });
  beforeEach(async () => {
    await sql`DELETE FROM licenses`;
  });

  it("Approved charge extends expires_at by 30 days, resets retry_count", async () => {
    await sql`
      INSERT INTO licenses (key, tier, max_sites, expires_at, recurring_state, next_charge_at, wayforpay_recurring_token, retry_count)
      VALUES ('seo_K1', 'pro', 1, NOW() + INTERVAL '1 day', 'active', NOW() - INTERVAL '1 minute', 'rec-tok-1', 1)
    `;
    const charges: ChargeCall[] = [];
    const emails: EmailCall[] = [];
    await tickOnce(makeDeps({ sql, charges, emails }));

    const row = (await sql`SELECT * FROM licenses WHERE key = 'seo_K1'` as any[])[0];
    expect(charges.length).toBe(1);
    expect(charges[0].recToken).toBe("rec-tok-1");
    expect(charges[0].amount).toBe(19);
    expect(row.retry_count).toBe(0);
    expect(row.last_charge_result).toBe("approved");
    expect(new Date(row.expires_at).getTime()).toBeGreaterThan(Date.now() + 28 * 86400_000);
    expect(emails.length).toBe(0);
  });

  it("Declined increments retry_count and reschedules NOW+1d on first failure", async () => {
    await sql`
      INSERT INTO licenses (key, tier, max_sites, email, expires_at, recurring_state, next_charge_at, wayforpay_recurring_token, retry_count)
      VALUES ('seo_K2', 'pro', 1, 'u@x', NOW() + INTERVAL '5 day', 'active', NOW() - INTERVAL '1 minute', 'rec-tok-2', 0)
    `;
    const emails: EmailCall[] = [];
    await tickOnce(makeDeps({
      sql,
      emails,
      chargeResult: () => ({ transactionStatus: "Declined", reason: "insufficient", rawBody: {} }),
    }));

    const row = (await sql`SELECT * FROM licenses WHERE key = 'seo_K2'` as any[])[0];
    expect(row.retry_count).toBe(1);
    expect(row.last_charge_result).toBe("declined");
    const nextMs = new Date(row.next_charge_at).getTime();
    expect(nextMs).toBeGreaterThan(Date.now() + 23 * 3600_000);
    expect(nextMs).toBeLessThan(Date.now() + 25 * 3600_000);
    expect(emails.some(e => e.kind === "charge-failed" && e.key === "seo_K2")).toBe(true);
  });

  it("3rd Declined (retry_count 2→3) cancels + disables + cancelled email", async () => {
    await sql`
      INSERT INTO licenses (key, tier, max_sites, email, expires_at, recurring_state, next_charge_at, wayforpay_recurring_token, retry_count)
      VALUES ('seo_K3', 'pro', 1, 'u@x', NOW(), 'active', NOW() - INTERVAL '1 minute', 'rec-tok-3', 2)
    `;
    const emails: EmailCall[] = [];
    await tickOnce(makeDeps({
      sql,
      emails,
      chargeResult: () => ({ transactionStatus: "Declined", rawBody: {} }),
    }));

    const row = (await sql`SELECT * FROM licenses WHERE key = 'seo_K3'` as any[])[0];
    expect(row.recurring_state).toBe("cancelled");
    expect(row.status).toBe("disabled");
    expect(row.retry_count).toBe(3);
    expect(emails.some(e => e.kind === "cancelled" && e.key === "seo_K3")).toBe(true);
  });

  it("does not charge rows whose recurring_state is not 'active'", async () => {
    await sql`
      INSERT INTO licenses (key, tier, max_sites, expires_at, recurring_state, next_charge_at, wayforpay_recurring_token)
      VALUES ('seo_K4', 'pro', 1, NOW() + INTERVAL '1 day', 'cancelled', NOW() - INTERVAL '1 minute', 'rec-tok-4')
    `;
    const charges: ChargeCall[] = [];
    await tickOnce(makeDeps({ sql, charges }));
    expect(charges.length).toBe(0);
  });

  it("does not charge rows whose next_charge_at is in the future", async () => {
    await sql`
      INSERT INTO licenses (key, tier, max_sites, expires_at, recurring_state, next_charge_at, wayforpay_recurring_token)
      VALUES ('seo_K5', 'pro', 1, NOW() + INTERVAL '5 day', 'active', NOW() + INTERVAL '1 day', 'rec-tok-5')
    `;
    const charges: ChargeCall[] = [];
    await tickOnce(makeDeps({ sql, charges }));
    expect(charges.length).toBe(0);
  });

  it("does not charge rows without a recurring_token", async () => {
    await sql`
      INSERT INTO licenses (key, tier, max_sites, expires_at, recurring_state, next_charge_at)
      VALUES ('seo_K6', 'pro', 1, NOW() + INTERVAL '1 day', 'active', NOW() - INTERVAL '1 minute')
    `;
    const charges: ChargeCall[] = [];
    await tickOnce(makeDeps({ sql, charges }));
    expect(charges.length).toBe(0);
  });

  it("upcoming-renewal scan emails T-7d window once per period", async () => {
    await sql`
      INSERT INTO licenses (key, tier, max_sites, email, expires_at, recurring_state, next_charge_at, wayforpay_recurring_token)
      VALUES ('seo_K7', 'pro', 1, 'u7@x', NOW() + INTERVAL '8 day', 'active', NOW() + INTERVAL '7 day', 'rec-tok-7')
    `;
    const emails: EmailCall[] = [];
    await tickOnce(makeDeps({ sql, emails }));
    expect(emails.filter(e => e.kind === "upcoming-renewal" && e.key === "seo_K7").length).toBe(1);

    // Second tick must not re-send for the same period.
    emails.length = 0;
    await tickOnce(makeDeps({ sql, emails }));
    expect(emails.filter(e => e.kind === "upcoming-renewal").length).toBe(0);
  });

  it("upcoming-renewal skips rows without an email", async () => {
    await sql`
      INSERT INTO licenses (key, tier, max_sites, email, expires_at, recurring_state, next_charge_at, wayforpay_recurring_token)
      VALUES ('seo_K8', 'pro', 1, NULL, NOW() + INTERVAL '8 day', 'active', NOW() + INTERVAL '7 day', 'rec-tok-8')
    `;
    const emails: EmailCall[] = [];
    await tickOnce(makeDeps({ sql, emails }));
    expect(emails.length).toBe(0);
  });
});
