import { describe, it, expect } from "bun:test";
import { createLicenseCache, type LicenseCache } from "../lib/license/cache";
import type { Tier } from "../lib/license/key-format";

const FAKE_NOW = 1_700_000_000_000;

describe("createLicenseCache", () => {
  it("first lookup misses and falls through to loader", async () => {
    let loaderCalls = 0;
    const cache: LicenseCache = createLicenseCache({ ttlMs: 60_000 });
    const loader = async (key: string) => { loaderCalls++; return { tier: "pro" as Tier, expiresAt: FAKE_NOW + 1000 }; };
    const r1 = await cache.lookup("k1", loader);
    expect(r1?.tier).toBe("pro");
    expect(loaderCalls).toBe(1);
  });

  it("second lookup within TTL hits cache (loader not called)", async () => {
    let loaderCalls = 0;
    const cache = createLicenseCache({ ttlMs: 60_000 });
    const loader = async () => { loaderCalls++; return { tier: "pro" as Tier, expiresAt: FAKE_NOW }; };
    await cache.lookup("k1", loader);
    await cache.lookup("k1", loader);
    expect(loaderCalls).toBe(1);
  });

  it("invalidate evicts the entry", async () => {
    let loaderCalls = 0;
    const cache = createLicenseCache({ ttlMs: 60_000 });
    const loader = async () => { loaderCalls++; return { tier: "pro" as Tier, expiresAt: FAKE_NOW }; };
    await cache.lookup("k1", loader);
    cache.invalidate("k1");
    await cache.lookup("k1", loader);
    expect(loaderCalls).toBe(2);
  });

  it("loader returning null is cached as null (not re-fetched)", async () => {
    let loaderCalls = 0;
    const cache = createLicenseCache({ ttlMs: 60_000 });
    const loader = async () => { loaderCalls++; return null; };
    const r1 = await cache.lookup("k1", loader);
    const r2 = await cache.lookup("k1", loader);
    expect(r1).toBeNull();
    expect(r2).toBeNull();
    expect(loaderCalls).toBe(1);
  });
});
