import type { Context, MiddlewareHandler } from "hono";

/**
 * Fixed-window in-memory rate limiter, keyed by client IP.
 *
 * One bucket per (route × IP) lives in process memory; restart clears all
 * counts. Acceptable for the v1 single-instance deploy because:
 *   - the only public endpoint we limit is `/auth/token`, and a hostile
 *     mint-flood would be expensive but harmless (free-tier JWTs grant
 *     no privileges; license-keyed mints already have the HMAC + DB
 *     gate behind them);
 *   - `JWT_SECRET` rotation already invalidates every minted token, so
 *     a memory wipe doesn't widen the trust horizon.
 *
 * Multi-instance deploys would need a Redis-backed bucket (or a sticky
 * sessions hop at the LB). Out of scope for v1.
 *
 * `ipFrom` is injectable so tests can pin the IP without forging headers.
 * The default reads `X-Forwarded-For` (set by nginx) → `X-Real-IP` →
 * `"unknown"`. A bare-Bun (no proxy) deploy would fall through to
 * `"unknown"` and rate-limit everyone together, which is intentional —
 * defense in depth still applies even without a proxy.
 */
export type RateLimitOpts = {
  /** Tokens granted per window. */
  perMin: number;
  /** Window in ms. Defaults to 60 000. */
  windowMs?: number;
  /** Override the IP-resolution strategy. */
  ipFrom?: (c: Context) => string;
};

type Bucket = { tokens: number; resetAt: number };

export function makeRateLimit(opts: RateLimitOpts): MiddlewareHandler {
  const buckets = new Map<string, Bucket>();
  const window  = opts.windowMs ?? 60_000;
  const ipFrom  = opts.ipFrom ?? defaultIpFrom;

  return async (c, next) => {
    const ip  = ipFrom(c) || "unknown";
    const now = Date.now();
    let b = buckets.get(ip);
    if (!b || now >= b.resetAt) {
      b = { tokens: opts.perMin, resetAt: now + window };
      buckets.set(ip, b);
    }
    if (b.tokens <= 0) {
      const retryAfter = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
      c.header("Retry-After", String(retryAfter));
      return c.json({ error: "rate_limited", retry_after_seconds: retryAfter }, 429);
    }
    b.tokens--;
    await next();
  };
}

function defaultIpFrom(c: Context): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    // Take the leftmost entry — the original client. Trust depends on the
    // proxy being honest about not letting clients inject the header
    // themselves (nginx by default appends; only `proxy_set_header` rewrites).
    return xff.split(",")[0]!.trim();
  }
  const real = c.req.header("x-real-ip");
  if (real) return real.trim();
  return "";
}
