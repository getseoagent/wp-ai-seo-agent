// plugin-app/src/components/SpeedAuditCard.tsx
import { __ } from "../lib/i18n";

type Cwv = { lcp: number; cls: number; inp: number; fcp: number; ttfb: number };

type ReachableFix =
  | { id: "img_dim";              target: string }
  | { id: "img_lazy";              target: string }
  | { id: "img_picture_webp";      target: string }
  | { id: "head_preload_lcp";      target: string; lcp_url: string; template_scope: string }
  | { id: "head_preconnect";       target: string; origins: string[] }
  | { id: "head_dns_prefetch";     target: string; origins: string[] }
  | { id: "script_defer";          target: string; handles: string[] }
  | { id: "script_dequeue";        target: string; handles: string[] }
  | { id: "flag_disable_emoji";    target: string }
  | { id: "flag_disable_dashicons_frontend"; target: string }
  | { id: "flag_disable_jquery_migrate";     target: string };

type UnreachableRec =
  | { id: "rec_cache_plugin";       reason: string }
  | { id: "rec_image_plugin";       reason: string }
  | { id: "rec_optimize_existing";  plugin: string; setting: string; reason: string };

type SuccessShape = {
  url: string;
  strategy: "mobile" | "desktop";
  lighthouse_score: number;
  cwv: Cwv;
  reachable_fixes: ReachableFix[];
  unreachable_fixes: UnreachableRec[];
  template_info?: { type: string; post_type?: string; count_of_same_type: number };
  lcp_element?: { url: string; selector: string };
};

type ErrorShape = { error: string; upgrade_url?: string };

export function SpeedAuditCard({ result }: { result: unknown }) {
  if (isError(result)) {
    return (
      <div style={errorStyle}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{result.error}</div>
        {result.upgrade_url && (
          <a href={result.upgrade_url} target="_blank" rel="noreferrer" style={{ color: "#2271b1" }}>
            {__("Compare plans")}
          </a>
        )}
      </div>
    );
  }
  if (!isSuccess(result)) {
    return <pre style={fallbackStyle}>{JSON.stringify(result, null, 2)}</pre>;
  }

  const r = result;
  const scoreColor = r.lighthouse_score >= 90 ? "#0a7d2c" : r.lighthouse_score >= 50 ? "#b26a00" : "#b32d2e";
  const counterAll = r.template_info?.count_of_same_type ?? 0;

  return (
    <div style={cardStyle}>
      <div style={headerRowStyle}>
        <strong>{r.strategy === "mobile" ? "📱" : "🖥"} {r.url}</strong>
        <span style={{ ...scoreBadge, background: scoreColor }}>{r.lighthouse_score}</span>
      </div>

      <div style={cwvRowStyle}>
        <CwvBadge label="LCP"  value={fmtMs(r.cwv.lcp)}  bad={r.cwv.lcp > 4000}  warn={r.cwv.lcp > 2500} />
        <CwvBadge label="CLS"  value={r.cwv.cls.toFixed(2)} bad={r.cwv.cls > 0.25} warn={r.cwv.cls > 0.1} />
        <CwvBadge label="INP"  value={fmtMs(r.cwv.inp)}  bad={r.cwv.inp > 500}   warn={r.cwv.inp > 200} />
        <CwvBadge label="FCP"  value={fmtMs(r.cwv.fcp)}  bad={r.cwv.fcp > 3000}  warn={r.cwv.fcp > 1800} />
        <CwvBadge label="TTFB" value={fmtMs(r.cwv.ttfb)} bad={r.cwv.ttfb > 1000} warn={r.cwv.ttfb > 600} />
      </div>

      {r.reachable_fixes.length > 0 && (
        <>
          <div style={sectionTitleStyle}>{__("Things we can fix")}</div>
          <ul style={listStyle}>
            {r.reachable_fixes.map((f, i) => <li key={i}>{describeFix(f)}</li>)}
          </ul>
        </>
      )}

      {r.unreachable_fixes.length > 0 && (
        <>
          <div style={{ ...sectionTitleStyle, color: "#646970" }}>{__("Recommendations")}</div>
          <ul style={{ ...listStyle, color: "#646970" }}>
            {r.unreachable_fixes.map((u, i) => <li key={i}>{describeRec(u)}</li>)}
          </ul>
        </>
      )}

      {counterAll > 1 && r.template_info?.type && (
        <div style={hintStyle}>
          {__("Some of these are template-wide — they affect every page of type")}{" "}
          <code>{r.template_info.type}</code> ({counterAll} {__("pages")}).
        </div>
      )}
    </div>
  );
}

function isError(v: unknown): v is ErrorShape {
  return !!v && typeof v === "object" && typeof (v as Record<string, unknown>).error === "string";
}
function isSuccess(v: unknown): v is SuccessShape {
  return !!v && typeof v === "object" && typeof (v as Record<string, unknown>).url === "string" && typeof (v as Record<string, unknown>).lighthouse_score === "number";
}
function fmtMs(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + " s";
  return Math.round(n) + " ms";
}
function describeFix(f: ReachableFix): string {
  switch (f.id) {
    case "img_dim":              return __("Add width/height to images (fixes CLS)");
    case "img_lazy":              return __("Add loading=lazy to offscreen images");
    case "img_picture_webp":      return __("Wrap images in <picture> with WebP source");
    case "head_preload_lcp":      return __("Preload LCP image in <head> for {scope} template").replace("{scope}", f.template_scope);
    case "head_preconnect":       return __("Preconnect to: {origins}").replace("{origins}", f.origins.join(", "));
    case "head_dns_prefetch":     return __("DNS-prefetch for: {origins}").replace("{origins}", f.origins.join(", "));
    case "script_defer":          return __("Defer scripts: {handles}").replace("{handles}", f.handles.join(", "));
    case "script_dequeue":        return __("Remove unused scripts: {handles}").replace("{handles}", f.handles.join(", "));
    case "flag_disable_emoji":    return __("Disable wp-emoji on the frontend");
    case "flag_disable_dashicons_frontend": return __("Dequeue dashicons for non-admins");
    case "flag_disable_jquery_migrate":     return __("Drop jquery-migrate");
  }
}
function describeRec(u: UnreachableRec): string {
  switch (u.id) {
    case "rec_cache_plugin":     return u.reason;
    case "rec_image_plugin":     return u.reason;
    case "rec_optimize_existing": return `${u.plugin}: ${u.setting} — ${u.reason}`;
  }
}

function CwvBadge({ label, value, bad, warn }: { label: string; value: string; bad?: boolean; warn?: boolean }) {
  const color = bad ? "#b32d2e" : warn ? "#b26a00" : "#0a7d2c";
  return (
    <span style={{ ...cwvBadge, color }}>
      <strong>{label}</strong> {value}
    </span>
  );
}

const cardStyle: React.CSSProperties = { border: "1px solid #dbe4ec", borderRadius: 8, padding: 12, fontSize: 13, background: "#fff" };
const errorStyle: React.CSSProperties = { ...cardStyle, background: "#fff7f7", borderColor: "#e6c0c0" };
const fallbackStyle: React.CSSProperties = { fontSize: 11, fontFamily: "ui-monospace, monospace", background: "#f6f7f7", padding: 8, borderRadius: 6 };
const headerRowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 8 };
const scoreBadge: React.CSSProperties = { color: "#fff", padding: "2px 10px", borderRadius: 12, fontWeight: 700, fontSize: 13, minWidth: 32, textAlign: "center" };
const cwvRowStyle: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 };
const cwvBadge: React.CSSProperties = { fontSize: 12, background: "#f3f5f7", padding: "3px 8px", borderRadius: 6, border: "1px solid #e0e6ec" };
const sectionTitleStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, marginTop: 8, marginBottom: 4 };
const listStyle: React.CSSProperties = { margin: 0, paddingLeft: 16, fontSize: 12 };
const hintStyle: React.CSSProperties = { marginTop: 8, fontSize: 11, color: "#646970", fontStyle: "italic" };
