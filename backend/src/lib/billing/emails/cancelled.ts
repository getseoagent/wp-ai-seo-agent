import type { LicenseSnapshot, RenderedEmail } from "./transport";
import { escapeHtml, tierTitle, wrap } from "./_helpers";

export function renderCancelled(license: LicenseSnapshot): RenderedEmail {
  const tier = tierTitle(license.tier);
  return {
    subject: `Your AI SEO Agent ${tier} subscription has been cancelled`,
    html: wrap(`
<h1 style="margin-top:0;font-size:22px;">Subscription cancelled</h1>
<p>After three failed renewal attempts we've cancelled your AI SEO Agent <strong>${escapeHtml(tier)}</strong> subscription. The plugin has been switched back to free-tier limits — your existing posts and audit history are untouched.</p>
<p>If this was unexpected, you can re-subscribe any time from the Subscription tab inside the plugin admin, or contact us at hello@seo-friendly.org.</p>`),
  };
}
