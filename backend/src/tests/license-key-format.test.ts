import { describe, it, expect } from "bun:test";
import { generateKey, parseKey, type Tier } from "../lib/license/key-format";

const SECRET = "test-secret-32-bytes-for-hmac----";

describe("license/key-format", () => {
  it("generate produces a key with seo_ prefix and matches roundtrip via parse", () => {
    const { key, expiryAt, tier } = generateKey({ tier: "pro", expirySeconds: 30 * 86400, secret: SECRET });
    expect(key.startsWith("seo_")).toBe(true);
    const parsed = parseKey(key, SECRET);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.tier).toBe("pro");
      expect(parsed.expiryAt).toBe(expiryAt);
    }
  });

  it("parse rejects key with tampered HMAC", () => {
    const { key } = generateKey({ tier: "pro", expirySeconds: 86400, secret: SECRET });
    // Flip a character in the HMAC suffix
    const tampered = key.slice(0, -2) + (key.slice(-2) === "AA" ? "BB" : "AA");
    const parsed = parseKey(tampered, SECRET);
    expect(parsed.ok).toBe(false);
  });

  it("parse rejects key signed with different secret", () => {
    const { key } = generateKey({ tier: "pro", expirySeconds: 86400, secret: SECRET });
    const parsed = parseKey(key, "different-secret-32-bytes-for-hmac");
    expect(parsed.ok).toBe(false);
  });

  it("parse rejects malformed key (no seo_ prefix)", () => {
    const parsed = parseKey("not_a_key", SECRET);
    expect(parsed.ok).toBe(false);
  });

  it("parse extracts correct tier for each enum value", () => {
    const tiers: Tier[] = ["free", "pro", "agency", "enterprise"];
    for (const t of tiers) {
      const { key } = generateKey({ tier: t, expirySeconds: 3600, secret: SECRET });
      const parsed = parseKey(key, SECRET);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.tier).toBe(t);
    }
  });

  it("parse reports expiry past current time as expired", () => {
    const { key } = generateKey({ tier: "pro", expirySeconds: -10, secret: SECRET });
    const parsed = parseKey(key, SECRET);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.expired).toBe(true);
  });
});
