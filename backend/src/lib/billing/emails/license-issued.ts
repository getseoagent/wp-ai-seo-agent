import type { LicenseSnapshot, RenderedEmail } from "./transport";
import { escapeHtml, tierTitle, wrap } from "./_helpers";

export function renderLicenseIssued(license: LicenseSnapshot): RenderedEmail {
  const tier = tierTitle(license.tier);
  return {
    subject: `Your AI SEO Agent ${tier} license`,
    html: wrap(`
<h1 style="margin-top:0;font-size:22px;">Welcome to AI SEO Agent ${escapeHtml(tier)}!</h1>
<p>Your license key:</p>
<pre style="background:#f4f5f7;padding:12px;border-radius:4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all;font-size:14px;">${escapeHtml(license.key)}</pre>
<p>Paste it into the SEO Agent settings page in your WordPress admin to unlock ${escapeHtml(tier)}-tier tools.</p>
<p>Your subscription renews automatically every 30 days. You can manage or cancel it any time from the Subscription tab inside the plugin.</p>`),
  };
}
