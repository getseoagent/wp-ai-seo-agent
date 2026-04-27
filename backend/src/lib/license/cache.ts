import type { Tier } from "./key-format";

export type LicenseCacheEntry = {
  tier: Tier;
  expiresAt: number;     // unix ms — license expiry
} | null;                 // null means "verified-not-found" (cached negative lookup)

export type LicenseCache = {
  lookup(key: string, loader: (key: string) => Promise<LicenseCacheEntry>): Promise<LicenseCacheEntry>;
  invalidate(key: string): void;
};

/**
 * 60-second TTL cache for license verifications. Hot path on every chat request,
 * so DB lookup latency matters. Cached entry includes negative results (null
 * means "we checked, it's not a valid license") to prevent retry storms on
 * malformed keys.
 *
 * Size unbounded for v1 — license set grows linearly with paying customers,
 * 60s TTL bounds working set. Add LRU eviction at Plan 5+ if hot-set exceeds
 * a few thousand active keys.
 */
export function createLicenseCache(opts: { ttlMs: number }): LicenseCache {
  const cache = new Map<string, { value: LicenseCacheEntry; cachedAt: number }>();
  const ttl = opts.ttlMs;

  return {
    async lookup(key, loader) {
      const cached = cache.get(key);
      const now = Date.now();
      if (cached && now - cached.cachedAt < ttl) {
        return cached.value;
      }
      const fresh = await loader(key);
      cache.set(key, { value: fresh, cachedAt: now });
      return fresh;
    },
    invalidate(key) {
      cache.delete(key);
    },
  };
}
