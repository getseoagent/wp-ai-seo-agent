// backend/src/tests/tools-speed.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import { dispatchTool } from "../lib/tools";
import { _resetPsiCacheForTests } from "../lib/speed/psi-client";
import { _resetPsiRateLimitForTests } from "../lib/speed/rate-limit";

const FAKE_PSI_BODY = {
  lighthouseResult: {
    finalUrl: "https://example.com/",
    categories: { performance: { score: 0.42 } },
    audits: {
      "largest-contentful-paint": { numericValue: 4200 },
      "cumulative-layout-shift":  { numericValue: 0.34 },
      "interaction-to-next-paint":{ numericValue: 320 },
      "first-contentful-paint":   { numericValue: 1900 },
      "server-response-time":     { numericValue: 600 },
      "unsized-images": { id: "unsized-images", title: "x" },
      "largest-contentful-paint-element": { details: { items: [{ items: [{ url: "https://example.com/hero.jpg" }] }] } },
    },
  },
};

const okFetch = (async () => new Response(JSON.stringify(FAKE_PSI_BODY), { status: 200 })) as unknown as typeof fetch;

const fakeWp = {} as any; // not used for audit_url_speed

describe("audit_url_speed dispatch", () => {
  beforeEach(() => { _resetPsiCacheForTests(); _resetPsiRateLimitForTests(); });

  it("returns upgrade hint on free tier", async () => {
    const r = await dispatchTool(
      "audit_url_speed",
      { url: "https://example.com/", strategy: "mobile", _psi_api_key: "k" },
      fakeWp, undefined, undefined, undefined, "free",
    );
    expect((r as any).error).toMatch(/Pro/);
    expect((r as any).upgrade_url).toBeDefined();
  });

  it("returns a normalized PsiAudit on pro tier", async () => {
    const r = await dispatchTool(
      "audit_url_speed",
      { url: "https://example.com/", strategy: "mobile", _psi_api_key: "k", _fetch_impl: okFetch },
      fakeWp, undefined, undefined, undefined, "pro",
    );
    expect((r as any).lighthouse_score).toBe(42);
    expect((r as any).cwv.lcp).toBe(4200);
  });

  it("rejects when PSI key is missing", async () => {
    const r = await dispatchTool(
      "audit_url_speed",
      { url: "https://example.com/", strategy: "mobile" },
      fakeWp, undefined, undefined, undefined, "pro",
    );
    expect((r as any).error).toMatch(/PSI key/i);
  });

  it("enforces 500/day cap on pro tier", async () => {
    // Hammer the limiter past 500
    for (let i = 0; i < 501; i++) {
      await dispatchTool(
        "audit_url_speed",
        { url: `https://example.com/${i}`, strategy: "mobile", _psi_api_key: "k", _fetch_impl: okFetch, _license_key: "lic-1" },
        fakeWp, undefined, undefined, undefined, "pro",
      );
    }
    const r = await dispatchTool(
      "audit_url_speed",
      { url: "https://example.com/501", strategy: "mobile", _psi_api_key: "k", _fetch_impl: okFetch, _license_key: "lic-1" },
      fakeWp, undefined, undefined, undefined, "pro",
    );
    expect((r as any).error).toMatch(/rate limit|daily/i);
  });

  it("agency tier has no cap", async () => {
    for (let i = 0; i < 600; i++) {
      const r = await dispatchTool(
        "audit_url_speed",
        { url: `https://example.com/x${i}`, strategy: "mobile", _psi_api_key: "k", _fetch_impl: okFetch, _license_key: "lic-2" },
        fakeWp, undefined, undefined, undefined, "agency",
      );
      expect((r as any).error).toBeUndefined();
    }
  });
});
