import { describe, expect, it } from "bun:test";

process.env.WP_BASE_URL ??= "https://test.example";
process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
process.env.LICENSE_HMAC_SECRET ??= "test-secret-32-bytes-for-hmac----";
process.env.WAYFORPAY_MERCHANT_ACCOUNT ??= "test-wfp-account";
process.env.WAYFORPAY_MERCHANT_SECRET_KEY ??= "test-wfp-secret";
process.env.WAYFORPAY_DOMAIN ??= "test.example";
process.env.JWT_SECRET ??= "test-jwt-secret-32-bytes-min-pls!";

const { app } = await import("../index");

describe("GET /health", () => {
  it("responds 200 with {status: 'ok'}", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
