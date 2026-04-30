// backend/src/lib/speed/propose.ts
import type {
  PsiAudit, SpeedFix, SpeedRec, TemplateInfo, OptimizerDetection,
} from "./types";

const SAFE_DEQUEUE_HANDLES: ReadonlyArray<{ pattern: RegExp; handle: string }> = [
  { pattern: /\/wp-includes\/js\/wp-embed/, handle: "wp-embed" },
  { pattern: /\/wp-includes\/js\/comment-reply/, handle: "comment-reply" },
];

export function proposeSpeedFixes(
  audit: PsiAudit,
  template: TemplateInfo,
  optimizers: OptimizerDetection,
): { reachable: SpeedFix[]; unreachable: SpeedRec[] } {
  const reachable: SpeedFix[] = [];
  const unreachable: SpeedRec[] = [];

  const opps = new Map(audit.opportunities.map(o => [o.id, o]));
  const hasCachePlugin = optimizers.cache.some(p => p.active);
  const hasImagePlugin = optimizers.image.some(p => p.active);
  const hasWebpFiles  = optimizers.image.some(p => p.active && p.has_webp_files === true);
  const autoOptActive  = optimizers.css_js.some(p => p.active && p.slug === "autoptimize");

  // Group A — content fixes
  if (opps.has("unsized-images")) {
    reachable.push({ id: "img_dim", target: "post_content" });
  }
  if (opps.has("offscreen-images")) {
    const o = opps.get("offscreen-images")!;
    reachable.push({ id: "img_lazy", target: "post_content", est_kb_saved: o.savings_kb });
  }
  if (opps.has("modern-image-formats")) {
    const o = opps.get("modern-image-formats")!;
    if (hasWebpFiles) {
      reachable.push({ id: "img_picture_webp", target: "post_content", est_kb_saved: o.savings_kb });
    } else if (!hasImagePlugin) {
      unreachable.push({
        id: "rec_image_plugin",
        reason: "Modern image formats save ~" + (o.savings_kb ?? 0) + " KB but no image plugin is installed. ShortPixel, EWWW, Imagify, or Smush can generate WebP siblings.",
      });
    } // else: a plugin is installed but webp files aren't generated yet — silent (user knows their plugin)
  }

  // Group B — head fixes
  if (audit.lcp_element?.url && audit.cwv.lcp > 2500) {
    reachable.push({
      id: "head_preload_lcp",
      target: "head",
      lcp_url: audit.lcp_element.url,
      template_scope: template.type,
    });
  }
  if (opps.has("uses-rel-preconnect")) {
    const items = (opps.get("uses-rel-preconnect")?.details as any)?.items ?? [];
    const origins: string[] = [];
    for (const it of items) {
      if (typeof it?.url === "string") {
        try { origins.push(new URL(it.url).origin); } catch { /* skip malformed */ }
      }
    }
    const dedup = Array.from(new Set(origins)).slice(0, 3);
    if (dedup.length > 0) reachable.push({ id: "head_preconnect", target: "head", origins: dedup });
  }
  if (opps.has("uses-rel-dns-prefetch")) {
    const items = (opps.get("uses-rel-dns-prefetch")?.details as any)?.items ?? [];
    const origins: string[] = [];
    for (const it of items) {
      if (typeof it?.url === "string") {
        try { origins.push(new URL(it.url).origin); } catch {}
      }
    }
    const dedup = Array.from(new Set(origins)).slice(0, 5);
    if (dedup.length > 0) reachable.push({ id: "head_dns_prefetch", target: "head", origins: dedup });
  }

  // Group C — scripts
  if (opps.has("render-blocking-resources")) {
    const items = (opps.get("render-blocking-resources")?.details as any)?.items ?? [];
    const dequeueHandles: string[] = [];
    for (const it of items) {
      if (typeof it?.url !== "string") continue;
      for (const safe of SAFE_DEQUEUE_HANDLES) {
        if (safe.pattern.test(it.url) && !dequeueHandles.includes(safe.handle)) {
          dequeueHandles.push(safe.handle);
        }
      }
    }
    if (dequeueHandles.length > 0) {
      reachable.push({ id: "script_dequeue", target: "scripts", handles: dequeueHandles });
    }
    // We do NOT auto-propose script_defer in v1 unless an Autoptimize-style plugin is absent;
    // and even then only with an explicit allowlist set in Plan 5b's appliers.
    if (!autoOptActive) {
      // emit no fix here — defer is in the next plan; surface as a rec instead if the user wants that lever
      unreachable.push({
        id: "rec_optimize_existing",
        plugin: "autoptimize",
        setting: "Aggregate JS",
        reason: "Render-blocking JS detected. We don't auto-defer arbitrary scripts in v1. Consider installing Autoptimize or WP Rocket and enabling JS aggregation.",
      });
    }
  }

  // Group E — site-level recommendations
  if (!hasCachePlugin && audit.cwv.lcp > 4000) {
    unreachable.push({
      id: "rec_cache_plugin",
      reason: "LCP " + Math.round(audit.cwv.lcp) + "ms with no cache plugin detected. Consider WP Rocket (paid) or LiteSpeed Cache (free, requires LiteSpeed server).",
    });
  }

  return { reachable, unreachable };
}
