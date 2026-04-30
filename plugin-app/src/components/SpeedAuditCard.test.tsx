// plugin-app/src/components/SpeedAuditCard.test.tsx
import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { SpeedAuditCard } from "./SpeedAuditCard";

afterEach(cleanup);

const auditPro = {
  url: "https://example.com/blog/post",
  strategy: "mobile" as const,
  fetched_at: "2026-04-30T10:00:00Z",
  lighthouse_score: 38,
  cwv: { lcp: 4200, cls: 0.34, inp: 320, fcp: 1900, ttfb: 600 },
  opportunities: [{ id: "unsized-images", title: "Image elements have explicit width/height" }],
  lcp_element: { url: "https://example.com/hero.jpg", selector: "img.hero" },
  reachable_fixes: [
    { id: "img_dim", target: "post_content" },
    { id: "head_preload_lcp", target: "head", lcp_url: "https://example.com/hero.jpg", template_scope: "single" },
  ],
  unreachable_fixes: [
    { id: "rec_cache_plugin", reason: "No cache plugin detected." },
  ],
  template_info: { type: "single", post_type: "post", count_of_same_type: 200 },
};

describe("SpeedAuditCard", () => {
  it("shows the lighthouse score badge", () => {
    render(<SpeedAuditCard result={auditPro} />);
    expect(screen.getByText(/38/)).toBeDefined();
  });

  it("shows CWV numbers with units", () => {
    render(<SpeedAuditCard result={auditPro} />);
    // "LCP" appears in both the CWV badge and the reachable fix description — use getAllByText
    expect(screen.getAllByText(/LCP/).length).toBeGreaterThan(0);
    expect(screen.getByText(/4\.2 s/)).toBeDefined();
    expect(screen.getByText(/0\.34/)).toBeDefined();
    expect(screen.getByText(/320 ms/)).toBeDefined();
  });

  it("renders reachable fixes as a list", () => {
    render(<SpeedAuditCard result={auditPro} />);
    expect(screen.getByText(/width\/height/i)).toBeDefined();
    expect(screen.getByText(/preload/i)).toBeDefined();
  });

  it("renders unreachable recommendations as gray rows", () => {
    render(<SpeedAuditCard result={auditPro} />);
    expect(screen.getByText(/cache plugin/i)).toBeDefined();
  });

  it("shows template-wide action when count_of_same_type > 1", () => {
    render(<SpeedAuditCard result={auditPro} />);
    // Component renders "(200 pages)" — checking for "200 pages" rather than "all 200"
    // because the component copy is "(<count> pages)" without "all"
    expect(screen.getByText(/200 pages/i)).toBeDefined();
  });

  it("free-tier shape renders an upgrade prompt", () => {
    render(<SpeedAuditCard result={{ error: "audit_url_speed requires Pro tier or higher.", upgrade_url: "https://www.seo-friendly.org/pricing" }} />);
    expect(screen.getByText(/Pro/)).toBeDefined();
    expect(screen.getByRole("link", { name: /Compare plans|Сравнить тарифы/i })).toBeDefined();
  });
});
