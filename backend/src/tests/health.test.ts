import { describe, expect, it } from "bun:test";

process.env.WP_BASE_URL ??= "https://test.example";
process.env.WRITE_SECRET ??= "test-write-secret";
process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
process.env.LICENSE_HMAC_SECRET ??= "test-secret-32-bytes-for-hmac----";

const { app } = await import("../index");

describe("GET /health", () => {
  it("responds 200 with {status: 'ok'}", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
