// backend/src/lib/speed/psi-client.ts
import type { PsiAudit, PsiOpportunity } from "./types";

const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes

type CacheEntry = { result: PsiAudit; expiresAt: number };
const cache = new Map<string, CacheEntry>();

export class PsiError extends Error {
  constructor(public readonly kind: "key_invalid" | "quota" | "network" | "shape", message: string) {
    super(message);
    this.name = "PsiError";
  }
}

export type FetchPsiOpts = {
  fetchImpl?: typeof fetch;
  nocache?: boolean;
};

export function _resetPsiCacheForTests(): void {
  cache.clear();
}

export async function fetchPsi(
  url: string,
  strategy: "mobile" | "desktop",
  apiKey: string,
  signal?: AbortSignal,
  opts: FetchPsiOpts = {},
): Promise<PsiAudit> {
  const key = `${strategy}|${url}`;
  if (!opts.nocache) {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.result;
    }
  }

  const f = opts.fetchImpl ?? fetch;
  const qs = new URLSearchParams({
    url,
    strategy,
    key: apiKey,
    category: "performance",
  });
  // PSI requires multiple `category` params for speed-only audits
  const reqUrl = `${PSI_ENDPOINT}?${qs.toString()}`;

  let res: Response;
  try {
    res = await f(reqUrl, { signal });
  } catch (e) {
    throw new PsiError("network", `PSI fetch failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  let body: any;
  try {
    body = await res.json();
  } catch {
    throw new PsiError("shape", `PSI non-JSON response (HTTP ${res.status})`);
  }

  if (!res.ok) {
    const reason: string = body?.error?.errors?.[0]?.reason ?? "";
    const message: string = body?.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 400 && /invalid|key/i.test(message + reason)) {
      throw new PsiError("key_invalid", `PSI key invalid: ${message}`);
    }
    if (res.status === 429 || /quota/i.test(message + reason)) {
      throw new PsiError("quota", `PSI quota exhausted: ${message}`);
    }
    throw new PsiError("network", `PSI HTTP ${res.status}: ${message}`);
  }

  const audit = normalize(body, url, strategy);
  cache.set(key, { result: audit, expiresAt: Date.now() + CACHE_TTL_MS });
  return audit;
}

function normalize(body: any, url: string, strategy: "mobile" | "desktop"): PsiAudit {
  const lr = body?.lighthouseResult;
  if (!lr) throw new PsiError("shape", "PSI response missing lighthouseResult");

  const audits = lr.audits ?? {};
  const score = Math.round((lr.categories?.performance?.score ?? 0) * 100);

  const cwv = {
    lcp:  numeric(audits["largest-contentful-paint"]),
    cls:  numeric(audits["cumulative-layout-shift"]),
    inp:  numeric(audits["interaction-to-next-paint"]) || numeric(audits["max-potential-fid"]),
    fcp:  numeric(audits["first-contentful-paint"]),
    ttfb: numeric(audits["server-response-time"]),
  };

  const opportunities = collectOpportunities(audits);
  const lcp_element = extractLcpElement(audits["largest-contentful-paint-element"]);

  return {
    url:               lr.finalUrl ?? url,
    strategy,
    fetched_at:        new Date().toISOString(),
    lighthouse_score:  score,
    cwv,
    opportunities,
    ...(lcp_element ? { lcp_element } : {}),
  };
}

function numeric(audit: any): number {
  const v = audit?.numericValue;
  return typeof v === "number" ? v : 0;
}

const SPEED_AUDIT_IDS: ReadonlySet<string> = new Set([
  "unsized-images", "offscreen-images", "modern-image-formats",
  "uses-rel-preconnect", "uses-rel-dns-prefetch",
  "render-blocking-resources",
  "unused-javascript", "unused-css-rules",
  "uses-text-compression", "uses-long-cache-ttl",
]);

function collectOpportunities(audits: Record<string, any>): PsiOpportunity[] {
  const out: PsiOpportunity[] = [];
  for (const [id, raw] of Object.entries(audits)) {
    if (!SPEED_AUDIT_IDS.has(id)) continue;
    const savings_ms = typeof raw?.numericValue === "number" ? raw.numericValue : undefined;
    const savings_kb = typeof raw?.details?.overallSavingsBytes === "number"
      ? Math.round(raw.details.overallSavingsBytes / 1024)
      : undefined;
    out.push({ id, title: raw.title ?? id, savings_ms, savings_kb, details: raw.details });
  }
  return out;
}

function extractLcpElement(audit: any): PsiAudit["lcp_element"] {
  const item = audit?.details?.items?.[0]?.items?.[0];
  if (!item) return undefined;
  // PSI v5 LCP element shapes vary; we accept either {url} (image) or {snippet}
  const url = typeof item.url === "string" ? item.url : "";
  const selector = typeof item.selector === "string" ? item.selector : "";
  if (!url && !selector) return undefined;
  return { url, selector, node_label: typeof item.nodeLabel === "string" ? item.nodeLabel : undefined };
}
