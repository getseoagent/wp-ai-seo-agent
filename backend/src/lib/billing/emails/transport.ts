import type { Tier } from "../../license/key-format";

export type EmailKind = "license-issued" | "upcoming-renewal" | "charge-failed" | "cancelled";

export type LicenseSnapshot = {
  key:   string;
  email: string | null;
  tier:  Tier;
};

export type RenderedEmail = { subject: string; html: string };
export type EmailRenderer = (kind: EmailKind, license: LicenseSnapshot) => RenderedEmail;

const FROM_NAME       = "AI SEO Agent";
const FROM_EMAIL      = "noreply@getseoagent.app";
const BREVO_ENDPOINT  = "https://api.brevo.com/v3/smtp/email";
const MAX_ATTEMPTS    = 2;

/**
 * POSTs a transactional email to Brevo. No-ops when:
 *  - the license has no email on file (free-tier signups + tests),
 *  - BREVO_API_KEY is unset (dev-mode loud warn).
 *
 * Retries once on 5xx — Brevo's API hiccups occasionally. 4xx are permanent
 * (bad payload, blocked sender) so we don't retry. Billing state lives in
 * the DB; an unsent email is degraded service, not data loss.
 */
export async function sendTransactionalEmail(
  kind: EmailKind,
  license: LicenseSnapshot,
  render: EmailRenderer,
): Promise<void> {
  if (!license.email) return;
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn(`[email] BREVO_API_KEY unset; would have sent ${kind} → ${license.email}`);
    return;
  }

  const tpl  = render(kind, license);
  const body = {
    sender:      { name: FROM_NAME, email: FROM_EMAIL },
    to:          [{ email: license.email }],
    subject:     tpl.subject,
    htmlContent: tpl.html,
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(BREVO_ENDPOINT, {
        method:  "POST",
        headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
        body:    JSON.stringify(body),
      });
      if (res.ok) return;
      if (res.status < 500) {
        console.error(`[email] non-retryable ${res.status} for ${kind} → ${license.email}`);
        return;
      }
      console.warn(`[email] attempt ${attempt}/${MAX_ATTEMPTS} got ${res.status} for ${kind} → ${license.email}`);
    } catch (err) {
      console.error(`[email] attempt ${attempt}/${MAX_ATTEMPTS} threw:`, err instanceof Error ? err.message : String(err));
    }
  }
}
