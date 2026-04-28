import { describe, it, expect } from "bun:test";
import { renderEmail } from "../lib/billing/emails";

const license = { key: "seo_TESTKEY_<script>", email: "u@x", tier: "pro" as const };

describe("email templates", () => {
  it("license-issued embeds key (HTML-escaped) + paste-into-WP CTA + Pro tier", () => {
    const r = renderEmail("license-issued", license);
    expect(r.subject).toBe("Your AI SEO Agent Pro license");
    expect(r.html).toContain("Welcome to AI SEO Agent Pro!");
    // The key contains < and " — must come out HTML-safe.
    expect(r.html).toContain("seo_TESTKEY_&lt;script&gt;");
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("WordPress admin");
  });

  it("upcoming-renewal uses 7-day language and tier", () => {
    const r = renderEmail("upcoming-renewal", license);
    expect(r.subject).toContain("renews in 7 days");
    expect(r.html).toContain("7 days");
    expect(r.html).toContain("Pro");
  });

  it("charge-failed includes update-payment CTA + retry messaging", () => {
    const r = renderEmail("charge-failed", license);
    expect(r.subject).toContain("Action needed");
    expect(r.html).toContain("payment was declined");
    expect(r.html).toContain("secure.wayforpay.com");
    expect(r.html).toContain("three retries");
  });

  it("cancelled explains cancellation reason + free-tier fallback + re-sub path", () => {
    const r = renderEmail("cancelled", license);
    expect(r.subject).toContain("cancelled");
    expect(r.html).toContain("three failed renewal attempts");
    expect(r.html).toContain("free-tier");
    expect(r.html).toContain("re-subscribe");
  });

  it("uses plain HTML (no template engine artifacts) and includes brand chrome", () => {
    const r = renderEmail("license-issued", license);
    expect(r.html).toContain("<!doctype html>");
    expect(r.html).toContain("SEO-FRIENDLY");
    expect(r.html).not.toContain("{{");
    expect(r.html).not.toContain("<%");
  });
});
