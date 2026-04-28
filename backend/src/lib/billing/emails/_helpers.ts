export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function tierTitle(tier: string): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

/** Shared chrome around every email body. Branded plain-HTML so it renders
 *  in every client without external CSS. Keep <560px so Gmail's max-width
 *  still tolerates without horizontal-scroll. */
export function wrap(innerHtml: string): string {
  return `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;background:#f6f7f9;margin:0;padding:24px;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:6px;padding:32px;">
${innerHtml}
<p style="margin-top:32px;color:#888;font-size:13px;border-top:1px solid #eee;padding-top:16px;">— SEO-FRIENDLY · <a href="https://www.seo-friendly.org" style="color:#888;">www.seo-friendly.org</a></p>
</div>
</body></html>`;
}
