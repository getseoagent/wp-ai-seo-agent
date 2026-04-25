import type { MiddlewareHandler } from "hono";

export const requireSharedSecret: MiddlewareHandler = async (c, next) => {
  const expected = process.env.SHARED_SECRET;
  if (!expected) {
    return c.json({ error: "server misconfigured: SHARED_SECRET unset" }, 500);
  }
  const header = c.req.header("x-shared-secret");
  if (header !== expected) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
};
