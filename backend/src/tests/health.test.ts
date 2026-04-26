import { describe, expect, it } from "bun:test";

process.env.WP_BASE_URL ??= "https://test.example";

const { app } = await import("../index");

describe("GET /health", () => {
  it("responds 200 with {status: 'ok'}", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
