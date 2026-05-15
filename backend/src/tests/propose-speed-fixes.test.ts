// backend/src/tests/propose-speed-fixes.test.ts
import { describe, it, expect } from "bun:test";
import { proposeSpeedFixes } from "../lib/speed/propose";
import type { PsiAudit, TemplateInfo, OptimizerDetection } from "../lib/speed/types";
import sampleAudit from "../lib/speed/fixtures/sample-mobile-audit.json";

const SINGLE_TEMPLATE: TemplateInfo = { type: "single", post_id: 1234, post_type: "post", count_of_same_type: 200 };
const NO_OPTIMIZERS: OptimizerDetection = { cache: [], image: [], css_js: [] };

describe("proposeSpeedFixes", () => {
  it("emits img_dim, img_lazy, head_preload_lcp, head_preconnect, script_dequeue for the sample audit", () => {
    const out = proposeSpeedFixes(sampleAudit as PsiAudit, SINGLE_TEMPLATE, NO_OPTIMIZERS);
    const ids = out.reachable.map(f => f.id);
    expect(ids).toContain("img_dim");
    expect(ids).toContain("img_lazy");
    expect(ids).toContain("head_preload_lcp");
    expect(ids).toContain("head_preconnect");
    expect(ids).toContain("script_dequeue");
  });

  it("img_picture_webp is reachable only when an image plugin reports has_webp_files=true", () => {
    const withWebp: OptimizerDetection = { cache: [], image: [{ slug: "shortpixel", name: "ShortPixel", version: "5.0", active: true, has_webp_files: true }], css_js: [] };
    const withoutWebp: OptimizerDetection = { cache: [], image: [{ slug: "shortpixel", name: "ShortPixel", version: "5.0", active: true, has_webp_files: false }], css_js: [] };
    const a = proposeSpeedFixes(sampleAudit as PsiAudit, SINGLE_TEMPLATE, withWebp);
    const b = proposeSpeedFixes(sampleAudit as PsiAudit, SINGLE_TEMPLATE, withoutWebp);
    expect(a.reachable.some(f => f.id === "img_picture_webp")).toBe(true);
    expect(b.reachable.some(f => f.id === "img_picture_webp")).toBe(false);
  });

  it("recommends a cache plugin when none detected and LCP > 4s", () => {
    const out = proposeSpeedFixes(sampleAudit as PsiAudit, SINGLE_TEMPLATE, NO_OPTIMIZERS);
    expect(out.unreachable.find(r => r.id === "rec_cache_plugin")).toBeDefined();
  });

  it("does NOT recommend rec_cache_plugin when one is already detected", () => {
    const optimizers: OptimizerDetection = { cache: [{ slug: "wp-rocket", name: "WP Rocket", version: "3.0", active: true }], image: [], css_js: [] };
    const out = proposeSpeedFixes(sampleAudit as PsiAudit, SINGLE_TEMPLATE, optimizers);
    expect(out.unreachable.find(r => r.id === "rec_cache_plugin")).toBeUndefined();
  });

  it("recommends installing an image plugin when modern-image-formats opportunity exists and none detected", () => {
    const out = proposeSpeedFixes(sampleAudit as PsiAudit, SINGLE_TEMPLATE, NO_OPTIMIZERS);
    expect(out.unreachable.find(r => r.id === "rec_image_plugin")).toBeDefined();
  });

  it("head_preload_lcp scope matches the template type", () => {
    const out = proposeSpeedFixes(sampleAudit as PsiAudit, SINGLE_TEMPLATE, NO_OPTIMIZERS);
    const preload = out.reachable.find(f => f.id === "head_preload_lcp");
    expect(preload?.id).toBe("head_preload_lcp");
    if (preload?.id === "head_preload_lcp") {
      expect(preload.template_scope).toBe("single");
      expect(preload.lcp_url).toBe("https://example.com/hero.jpg");
    }
  });
});
