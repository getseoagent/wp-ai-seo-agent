import { describe, it, expect } from "bun:test";
import { signJwt, verifyJwt } from "../lib/jwt";

const SECRET = "secret-32-bytes-min-for-hs256-pls!";
const PREV   = "previous-secret-32-bytes-min-pls!!";

describe("jwt", () => {
  it("sign+verify roundtrip with current secret", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt({ site_url: "https://x", license_key: null, tier: "free", iat: now, exp: now + 3600 }, { current: SECRET });
    const result = verifyJwt(token, { current: SECRET });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.tier).toBe("free");
      expect(result.payload.site_url).toBe("https://x");
    }
  });

  it("verify accepts tokens signed by JWT_SECRET_PREVIOUS during rotation", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt({ site_url: "https://x", license_key: null, tier: "free", iat: now, exp: now + 3600 }, { current: PREV });
    const result = verifyJwt(token, { current: SECRET, previous: PREV });
    expect(result.ok).toBe(true);
  });

  it("verify rejects expired token", () => {
    const past = Math.floor(Date.now() / 1000) - 1000;
    const token = signJwt({ site_url: "x", license_key: null, tier: "free", iat: past - 3600, exp: past }, { current: SECRET });
    const result = verifyJwt(token, { current: SECRET });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
  });

  it("verify rejects tampered signature", () => {
    const token = signJwt({ site_url: "x", license_key: null, tier: "pro", iat: 1, exp: Math.floor(Date.now()/1000) + 3600 }, { current: SECRET });
    const tampered = token.slice(0, -3) + (token.slice(-3) === "AAA" ? "BBB" : "AAA");
    const result = verifyJwt(tampered, { current: SECRET });
    expect(result.ok).toBe(false);
  });

  it("verify rejects malformed token", () => {
    expect(verifyJwt("not.a.jwt", { current: SECRET }).ok).toBe(false);
    expect(verifyJwt("", { current: SECRET }).ok).toBe(false);
  });
});
