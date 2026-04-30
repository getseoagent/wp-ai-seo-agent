// backend/src/lib/speed/rate-limit.ts
const PRO_DAILY_CAP = 500;

type Bucket = { count: number; windowStartMs: number };
const buckets = new Map<string, Bucket>();

function dayKey(licenseKey: string): string {
  const dayIdx = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  return `${licenseKey}|${dayIdx}`;
}

export type CheckResult = { ok: true } | { ok: false; reason: string };

export function checkPsiRateLimit(licenseKey: string | undefined, tier: "free" | "pro" | "agency" | "enterprise"): CheckResult {
  if (tier === "agency" || tier === "enterprise") return { ok: true };
  if (tier === "free") return { ok: false, reason: "Speed audit is gated to Pro tier or higher." };
  // pro
  if (!licenseKey) return { ok: true }; // can't apply per-license cap without an identity; let it through
  const k = dayKey(licenseKey);
  const b = buckets.get(k) ?? { count: 0, windowStartMs: Date.now() };
  if (b.count >= PRO_DAILY_CAP) {
    return { ok: false, reason: `Pro tier daily PSI cap reached (${PRO_DAILY_CAP}). Upgrade to Agency for unlimited.` };
  }
  b.count++;
  buckets.set(k, b);
  return { ok: true };
}

export function _resetPsiRateLimitForTests(): void {
  buckets.clear();
}
