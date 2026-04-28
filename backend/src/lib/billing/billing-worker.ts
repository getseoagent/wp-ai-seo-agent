import type { SQL } from "bun";
import type { ChargeArgs, ChargeResult } from "./wayforpay-client";
import type { Tier } from "../license/key-format";
import { nextChargeDelayDays, shouldGiveUp } from "./retry-state";

export type EmailKind = "license-issued" | "upcoming-renewal" | "charge-failed" | "cancelled";

export type LicenseSnapshot = { key: string; email: string | null; tier: Tier };

export type TickDeps = {
  sql: SQL;
  chargeRecurring: (args: ChargeArgs) => Promise<ChargeResult>;
  sendEmail: (kind: EmailKind, license: LicenseSnapshot) => Promise<void>;
  amountForTier: (tier: Tier) => number;
  currency: string;
  /** Per-tick chunk size; bounded so a misbehaving WFP doesn't stall the tick. */
  batchSize?: number;
};

const DEFAULT_BATCH = 50;

/**
 * One full pass of the billing worker. Two phases:
 *
 *  1. Charge phase — every license whose `recurring_state='active'`,
 *     `next_charge_at <= NOW()`, and has a recurring_token. On Approved,
 *     extend `expires_at` by 30 days and reset `retry_count`. On Declined,
 *     advance the [1d, 3d, 7d] schedule and email; the 4th overall failure
 *     transitions to `recurring_state='cancelled'` + `status='disabled'`.
 *
 *  2. Reminder phase — `next_charge_at` ~7 days out, dedupe via
 *     `renewal_reminder_sent_for = expires_at`. Skips rows without an email.
 */
export async function tickOnce(deps: TickDeps): Promise<{ processed: number; reminders: number }> {
  const limit = deps.batchSize ?? DEFAULT_BATCH;

  // --- Phase 1: due charges --------------------------------------------------
  const due = await deps.sql`
    SELECT key, tier, email, wayforpay_recurring_token AS rec_token, retry_count
      FROM licenses
     WHERE recurring_state = 'active'
       AND next_charge_at IS NOT NULL
       AND next_charge_at <= NOW()
       AND wayforpay_recurring_token IS NOT NULL
     LIMIT ${limit}
  ` as Array<{ key: string; tier: Tier; email: string | null; rec_token: string; retry_count: number }>;

  let processed = 0;
  for (const row of due) {
    processed++;
    const amount = deps.amountForTier(row.tier);
    const result = await deps.chargeRecurring({
      recToken:       row.rec_token,
      orderReference: `renew-${row.key}-${Date.now()}`,
      amount,
      currency:       deps.currency,
      productName:    `AI SEO Agent — ${capitalize(row.tier)}`,
    });

    if (result.transactionStatus === "Approved") {
      await deps.sql`
        UPDATE licenses
           SET expires_at             = expires_at + INTERVAL '30 days',
               next_charge_at         = (expires_at + INTERVAL '30 days') - INTERVAL '1 day',
               retry_count            = 0,
               last_charge_result     = 'approved',
               last_charge_attempt_at = NOW()
         WHERE key = ${row.key}
      `;
      // No "renewal-success" email — silent renewal is the expected ux.
      continue;
    }

    // Anything not 'Approved' is treated as a failed charge.
    const newRetry = row.retry_count + 1;
    if (shouldGiveUp(newRetry)) {
      await deps.sql`
        UPDATE licenses
           SET recurring_state        = 'cancelled',
               status                 = 'disabled',
               disabled_at            = NOW(),
               disabled_reason        = ${`${newRetry} failed renewal attempts`},
               cancelled_at           = NOW(),
               retry_count            = ${newRetry},
               last_charge_result     = 'declined',
               last_charge_attempt_at = NOW()
         WHERE key = ${row.key}
      `;
      await deps.sendEmail("cancelled", { key: row.key, email: row.email, tier: row.tier });
    } else {
      const delay = nextChargeDelayDays(row.retry_count)!;
      await deps.sql`
        UPDATE licenses
           SET retry_count            = ${newRetry},
               next_charge_at         = NOW() + (${delay}::int * INTERVAL '1 day'),
               last_charge_result     = 'declined',
               last_charge_attempt_at = NOW()
         WHERE key = ${row.key}
      `;
      await deps.sendEmail("charge-failed", { key: row.key, email: row.email, tier: row.tier });
    }
  }

  // --- Phase 2: T-7d renewal reminders ---------------------------------------
  const reminderDue = await deps.sql`
    SELECT key, tier, email, expires_at
      FROM licenses
     WHERE recurring_state = 'active'
       AND email IS NOT NULL
       AND next_charge_at BETWEEN NOW() + INTERVAL '6 days' AND NOW() + INTERVAL '8 days'
       AND (renewal_reminder_sent_for IS NULL OR renewal_reminder_sent_for != expires_at)
     LIMIT ${limit}
  ` as Array<{ key: string; tier: Tier; email: string | null; expires_at: string }>;

  for (const r of reminderDue) {
    await deps.sendEmail("upcoming-renewal", { key: r.key, email: r.email, tier: r.tier });
    await deps.sql`UPDATE licenses SET renewal_reminder_sent_for = expires_at WHERE key = ${r.key}`;
  }

  return { processed, reminders: reminderDue.length };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Schedules tickOnce: first run 2 minutes after startup (lets the rest of the
 * server settle), then every 6 hours. Returns a stop() handle for graceful
 * shutdown / tests.
 */
export function startBillingWorker(deps: TickDeps): { stop: () => void } {
  const intervalMs = 6 * 60 * 60 * 1000;
  const handle: { interval: ReturnType<typeof setInterval> | null; bootstrap: ReturnType<typeof setTimeout> } = {
    interval: null,
    bootstrap: setTimeout(() => {
      void tickOnce(deps).catch(err => console.error("[billing] tick failed:", err));
      handle.interval = setInterval(() => {
        void tickOnce(deps).catch(err => console.error("[billing] tick failed:", err));
      }, intervalMs);
    }, 2 * 60 * 1000),
  };
  return {
    stop: () => {
      clearTimeout(handle.bootstrap);
      if (handle.interval) clearInterval(handle.interval);
    },
  };
}
