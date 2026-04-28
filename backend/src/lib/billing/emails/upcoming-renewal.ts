import type { LicenseSnapshot, RenderedEmail } from "./transport";
import { escapeHtml, tierTitle, wrap } from "./_helpers";

export function renderUpcomingRenewal(license: LicenseSnapshot): RenderedEmail {
  const tier = tierTitle(license.tier);
  return {
    subject: `Heads up: your AI SEO Agent ${tier} subscription renews in 7 days`,
    html: wrap(`
<h1 style="margin-top:0;font-size:22px;">Renewal coming up</h1>
<p>Your AI SEO Agent <strong>${escapeHtml(tier)}</strong> subscription will renew automatically in <strong>7 days</strong>.</p>
<p>You don't need to do anything — we'll charge the card on file and email you a receipt.</p>
<p>Need to update your card or cancel? Open the Subscription tab inside the plugin admin.</p>`),
  };
}
