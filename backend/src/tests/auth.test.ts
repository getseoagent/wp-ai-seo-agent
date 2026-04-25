import { describe, expect, it, beforeAll } from "bun:test";
import { Hono } from "hono";
import { requireSharedSecret } from "../lib/auth";

beforeAll(() => {
  process.env.SHARED_SECRET = "test-secret";
});

const app = new Hono();
app.use("*", requireSharedSecret);
app.get("/protected", (c) => c.text("ok"));

describe("requireSharedSecret", () => {
  it("rejects requests without header (401)", async () => {
    const res = await app.request("/protected");
    expect(res.status).toBe(401);
  });

  it("rejects wrong secret (401)", async () => {
    const res = await app.request("/protected", {
      headers: { "x-shared-secret": "wrong" },
    });
    expect(res.status).toBe(401);
  });

  it("accepts correct secret (200)", async () => {
    const res = await app.request("/protected", {
      headers: { "x-shared-secret": "test-secret" },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });
});
