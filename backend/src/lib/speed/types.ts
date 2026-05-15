// backend/src/lib/speed/types.ts

/**
 * Lighthouse / PSI v5 response, narrowed to the fields we use.
 * The full Lighthouse JSON is much larger; we extract only what
 * `propose_speed_fixes` and the UI need.
 */
export type PsiAudit = {
  url: string;
  strategy: "mobile" | "desktop";
  fetched_at: string; // ISO timestamp
  lighthouse_score: number; // 0..100
  cwv: {
    lcp: number;  // ms
    cls: number;  // unitless
    inp: number;  // ms (PSI uses INP since 2024; falls back to FID if absent)
    fcp: number;  // ms
    ttfb: number; // ms
  };
  opportunities: PsiOpportunity[];
  lcp_element?: { url: string; selector: string; node_label?: string };
};

export type PsiOpportunity = {
  id: string;            // Lighthouse audit id, e.g. "unsized-images"
  title: string;
  savings_ms?: number;
  savings_kb?: number;
  details?: unknown;     // raw Lighthouse details for tools that need it
};

/** A fix the agent can actually apply (Plan 5b adds the appliers). */
export type SpeedFix =
  | { id: "img_dim";              target: "post_content"; est_cls_gain?: number }
  | { id: "img_lazy";              target: "post_content"; est_kb_saved?: number }
  | { id: "img_picture_webp";      target: "post_content"; est_kb_saved?: number }
  | { id: "head_preload_lcp";      target: "head"; lcp_url: string; template_scope: TemplateScope }
  | { id: "head_preconnect";       target: "head"; origins: string[] }
  | { id: "head_dns_prefetch";     target: "head"; origins: string[] }
  | { id: "script_defer";          target: "scripts"; handles: string[] }
  | { id: "script_dequeue";        target: "scripts"; handles: string[] }
  | { id: "flag_disable_emoji";    target: "site_flag" }
  | { id: "flag_disable_dashicons_frontend"; target: "site_flag" }
  | { id: "flag_disable_jquery_migrate";     target: "site_flag" };

/** A recommendation we surface as text only; no apply path. */
export type SpeedRec =
  | { id: "rec_cache_plugin";       reason: string }
  | { id: "rec_image_plugin";       reason: string }
  | { id: "rec_optimize_existing";  plugin: string; setting: string; reason: string };

/** Subset of WP template hierarchy. Used for both detect_template_type and head_preload_lcp scope. */
export type TemplateScope =
  | "front_page" | "home"   | "single" | "page"
  | "category"   | "tag"    | "author" | "date"
  | "search"     | "404"    | "post_type_archive"
  | "shop"       | "product"| "cart"   | "checkout"
  | "global"     | "unknown";

export type TemplateInfo = {
  type: TemplateScope;
  post_id?: number;
  post_type?: string;
  count_of_same_type: number;
};

export type OptimizerDetection = {
  cache:   OptimizerEntry[];
  image:   OptimizerEntry[];
  css_js:  OptimizerEntry[];
};

export type OptimizerEntry = {
  slug: string;
  name: string;
  version: string;
  active: boolean;
  /** image plugins only; sampled from media library */
  has_webp_files?: boolean;
};
