import { describe, expect, it } from "bun:test";
import { app } from "../index";

describe("GET /health", () => {
  it("responds 200 with {status: 'ok'}", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
