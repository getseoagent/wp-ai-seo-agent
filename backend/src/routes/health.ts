import { Hono } from "hono";

export function mountHealth(app: Hono): void {
  app.get("/health", (c) => c.json({ status: "ok" }));
}
