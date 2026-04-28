import type { MiddlewareHandler } from "hono";
import { verifyJwt, type JwtPayload, type JwtSecrets } from "./jwt";

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

export type JwtVariables = { jwt: JwtPayload };

export const requireJwt: MiddlewareHandler<{ Variables: JwtVariables }> = async (c, next) => {
  const current = process.env.JWT_SECRET;
  if (!current) {
    return c.json({ error: "server misconfigured: JWT_SECRET unset" }, 500);
  }
  const secrets: JwtSecrets = process.env.JWT_SECRET_PREVIOUS
    ? { current, previous: process.env.JWT_SECRET_PREVIOUS }
    : { current };

  const auth = c.req.header("authorization");
  if (!auth || !/^bearer\s+/i.test(auth)) {
    return c.json({ error: "missing_token" }, 401);
  }
  const token = auth.replace(/^bearer\s+/i, "").trim();

  const result = verifyJwt(token, secrets);
  if (!result.ok) {
    return c.json({ error: result.reason }, 401);
  }
  c.set("jwt", result.payload);
  await next();
};
