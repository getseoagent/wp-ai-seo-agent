// backend/src/tests/psi-client.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import { fetchPsi, _resetPsiCacheForTests } from "../lib/speed/psi-client";

const FAKE_OK = {
  lighthouseResult: {
    finalUrl: "https://example.com/",
    categories: { performance: { score: 0.42 } },
    audits: {
      "largest-contentful-paint": { numericValue: 4200, displayValue: "4.2 s" },
      "cumulative-layout-shift":  { numericValue: 0.34, displayValue: "0.34" },
      "interaction-to-next-paint":{ numericValue: 320,  displayValue: "320 ms" },
      "first-contentful-paint":   { numericValue: 1900, displayValue: "1.9 s" },
      "server-response-time":     { numericValue: 600,  displayValue: "0.6 s" },
      "unsized-images":           { id: "unsized-images", title: "Image elements have explicit width/height", details: { items: [] } },
      "largest-contentful-paint-element": { details: { items: [{ items: [{ url: "https://example.com/hero.jpg" }] }] } },
    },
  },
};

function mockFetch(body: unknown, status = 200) {
  return async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("fetchPsi", () => {
  beforeEach(() => _resetPsiCacheForTests());

  it("returns a normalized PsiAudit for a valid response", async () => {
    const res = await fetchPsi("https://example.com/", "mobile", "fake-key", undefined, {
      fetchImpl: mockFetch(FAKE_OK) as typeof fetch,
    });
    expect(res.lighthouse_score).toBe(42);
    expect(res.cwv.lcp).toBe(4200);
    expect(res.cwv.cls).toBeCloseTo(0.34);
    expect(res.opportunities.find(o => o.id === "unsized-images")).toBeDefined();
    expect(res.lcp_element?.url).toBe("https://example.com/hero.jpg");
  });

  it("caches identical (url, strategy) calls within the TTL", async () => {
    let calls = 0;
    const fetchSpy = (async (..._: unknown[]) => {
      calls++;
      return new Response(JSON.stringify(FAKE_OK), { status: 200 });
    }) as unknown as typeof fetch;

    await fetchPsi("https://example.com/", "mobile", "k", undefined, { fetchImpl: fetchSpy });
    await fetchPsi("https://example.com/", "mobile", "k", undefined, { fetchImpl: fetchSpy });
    expect(calls).toBe(1);
  });

  it("nocache:true bypasses the cache", async () => {
    let calls = 0;
    const fetchSpy = (async (..._: unknown[]) => { calls++; return new Response(JSON.stringify(FAKE_OK), { status: 200 }); }) as unknown as typeof fetch;
    await fetchPsi("https://example.com/", "mobile", "k", undefined, { fetchImpl: fetchSpy });
    await fetchPsi("https://example.com/", "mobile", "k", undefined, { fetchImpl: fetchSpy, nocache: true });
    expect(calls).toBe(2);
  });

  it("throws PsiKeyInvalidError on 400 invalid_value", async () => {
    const errBody = { error: { code: 400, message: "API key not valid", errors: [{ reason: "invalid_value" }] } };
    await expect(
      fetchPsi("https://example.com/", "mobile", "bad", undefined, { fetchImpl: mockFetch(errBody, 400) as typeof fetch })
    ).rejects.toThrow(/key/i);
  });

  it("throws PsiQuotaError on 429", async () => {
    const errBody = { error: { code: 429, message: "Quota exceeded" } };
    await expect(
      fetchPsi("https://example.com/", "mobile", "k", undefined, { fetchImpl: mockFetch(errBody, 429) as typeof fetch })
    ).rejects.toThrow(/quota/i);
  });
});
