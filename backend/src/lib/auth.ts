import type { MiddlewareHandler } from "hono";
import { verifyJwt, type JwtPayload, type JwtSecrets } from "./jwt";

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
