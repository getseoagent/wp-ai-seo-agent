import { describe, it, expect } from "bun:test";
import { tierAllows } from "../lib/license/tier-gate";

describe("tierAllows", () => {
  it("read tools work for all tiers", () => {
    for (const tier of ["free", "pro", "agency", "enterprise"] as const) {
      expect(tierAllows("list_posts", tier, {}).ok).toBe(true);
      expect(tierAllows("get_post_summary", tier, {}).ok).toBe(true);
      expect(tierAllows("detect_seo_plugin", tier, {}).ok).toBe(true);
    }
  });

  it("propose_seo_rewrites caps at 5 for free, 20 for pro+", () => {
    expect(tierAllows("propose_seo_rewrites", "free", { post_ids: [1,2,3,4,5] }).ok).toBe(true);
    const overFreeCap = tierAllows("propose_seo_rewrites", "free", { post_ids: [1,2,3,4,5,6] });
    expect(overFreeCap.ok).toBe(false);
    expect(overFreeCap.error?.message).toMatch(/Pro/i);
    expect(tierAllows("propose_seo_rewrites", "pro", { post_ids: Array(20).fill(1) }).ok).toBe(true);
  });

  it("update_seo_fields requires Pro+", () => {
    expect(tierAllows("update_seo_fields", "free", {}).ok).toBe(false);
    expect(tierAllows("update_seo_fields", "pro", {}).ok).toBe(true);
    expect(tierAllows("update_seo_fields", "agency", {}).ok).toBe(true);
    expect(tierAllows("update_seo_fields", "enterprise", {}).ok).toBe(true);
  });

  it("apply_style_to_batch caps at 20 for pro, 200 for agency+", () => {
    expect(tierAllows("apply_style_to_batch", "free", { post_ids: [1] }).ok).toBe(false);
    expect(tierAllows("apply_style_to_batch", "pro", { post_ids: Array(20).fill(1) }).ok).toBe(true);
    const proOver = tierAllows("apply_style_to_batch", "pro", { post_ids: Array(50).fill(1) });
    expect(proOver.ok).toBe(false);
    expect(proOver.error?.message).toMatch(/Agency/i);
    expect(tierAllows("apply_style_to_batch", "agency", { post_ids: Array(200).fill(1) }).ok).toBe(true);
    expect(tierAllows("apply_style_to_batch", "enterprise", { post_ids: Array(200).fill(1) }).ok).toBe(true);
  });

  it("error returns include upgrade_url", () => {
    const r = tierAllows("update_seo_fields", "free", {});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.upgrade_url).toBe("https://www.seo-friendly.org/pricing");
      expect(r.error.message).toBeDefined();
    }
  });

  it("unknown tool defaults to denied (fail-closed)", () => {
    const r = tierAllows("nonexistent_tool" as any, "enterprise", {});
    expect(r.ok).toBe(false);
  });
});
