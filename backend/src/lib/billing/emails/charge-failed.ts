import type { LicenseSnapshot, RenderedEmail } from "./transport";
import { escapeHtml, tierTitle, wrap } from "./_helpers";

export function renderChargeFailed(license: LicenseSnapshot): RenderedEmail {
  const tier = tierTitle(license.tier);
  return {
    subject: `Action needed: we couldn't renew your AI SEO Agent ${tier} subscription`,
    html: wrap(`
<h1 style="margin-top:0;font-size:22px;">Renewal didn't go through</h1>
<p>We tried to renew your AI SEO Agent <strong>${escapeHtml(tier)}</strong> subscription but the payment was declined.</p>
<p>We'll automatically retry over the next few days. To resolve it sooner, update your card on the WayForPay portal:</p>
<p><a href="https://secure.wayforpay.com/account" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:4px;">Update payment method</a></p>
<p>If three retries fail, the subscription will be cancelled and ${escapeHtml(tier)}-tier tools will switch back to free-tier limits.</p>`),
  };
}
