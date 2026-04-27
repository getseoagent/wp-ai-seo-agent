import { formatBulkSummary, type FormattedBulkSummary } from "./format-bulk-summary";

const containerStyle: React.CSSProperties = { fontSize: 13, fontFamily: "system-ui, -apple-system, sans-serif" };
const headerStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" };
const headlineStyle: React.CSSProperties = { fontWeight: 600 };
const jobIdStyle: React.CSSProperties = { fontSize: 11, color: "#646970", fontFamily: "ui-monospace, monospace", padding: "1px 6px", background: "#f6f7f7", borderRadius: 3 };
const statusBadgeStyle: React.CSSProperties = { fontSize: 11, padding: "2px 8px", borderRadius: 10, textTransform: "lowercase" };
const statusColors: Record<string, React.CSSProperties> = {
  completed: { background: "#e7f5e7", color: "#2c6e2f" },
  cancelled: { background: "#fff8e5", color: "#996800" },
  failed: { background: "#fcf0f1", color: "#842029" },
  rolled_back: { background: "#e6f7ff", color: "#006399" },
};
const detailsStyle: React.CSSProperties = { marginTop: 6 };
const rowStyle: React.CSSProperties = { padding: "3px 0", borderBottom: "1px dotted #dbe4ec", fontSize: 12 };
const rowAppliedStyle: React.CSSProperties = { color: "#2c6e2f" };
const rowFailedStyle: React.CSSProperties = { color: "#842029" };
const rowSkippedStyle: React.CSSProperties = { color: "#996800" };
const actionRowStyle: React.CSSProperties = { marginTop: 8, paddingTop: 8, borderTop: "1px solid #dbe4ec" };
const buttonStyle: React.CSSProperties = { fontSize: 12, padding: "4px 10px", border: "1px solid #2271b1", color: "#2271b1", background: "#fff", borderRadius: 4, cursor: "pointer" };

export type BulkSummaryCardProps = {
  result: unknown;
  onSendChat?: (text: string) => void;
};

function rowColor(status: string): React.CSSProperties {
  if (status === "applied" || status === "rolled_back") return rowAppliedStyle;
  if (status === "failed") return rowFailedStyle;
  return rowSkippedStyle;
}

export function BulkSummaryCard({ result, onSendChat }: BulkSummaryCardProps) {
  let summary: FormattedBulkSummary;
  try {
    summary = formatBulkSummary(result);
  } catch {
    return <div style={containerStyle}>Could not format summary.</div>;
  }
  const badge = { ...statusBadgeStyle, ...(statusColors[summary.statusBadge] ?? statusColors.completed) };
  return (
    <div style={containerStyle}>
      <header style={headerStyle}>
        <span style={headlineStyle}>{summary.headline}</span>
        <span style={badge}>{summary.statusBadge}</span>
        <span style={jobIdStyle}>job {summary.jobId}</span>
      </header>
      <details style={detailsStyle}>
        <summary>show {summary.rows.length} {summary.rows.length === 1 ? "row" : "rows"}</summary>
        <div>
          {summary.rows.map((r, i) => (
            <div key={i} style={{ ...rowStyle, ...rowColor(r.status) }}>
              <strong>{r.label}</strong> — {r.status}
              {r.detail && <span style={{ color: "#646970", marginLeft: 6 }}>{r.detail}</span>}
            </div>
          ))}
        </div>
      </details>
      {summary.canRollback && onSendChat && (
        <div style={actionRowStyle}>
          <button
            style={buttonStyle}
            onClick={() => onSendChat(`rollback job ${summary.jobId}`)}
          >
            Rollback all in job {summary.jobId}
          </button>
        </div>
      )}
    </div>
  );
}
