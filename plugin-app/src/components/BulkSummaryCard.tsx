import { formatBulkSummary, formatBulkSummaryFromJob, type FormattedBulkSummary } from "./format-bulk-summary";
import { BULK_COLORS, BULK_STATUS_BG } from "./bulk-styles";
import type { Job } from "../hooks/useJobPolling";

const containerStyle: React.CSSProperties = { fontSize: 13, fontFamily: "system-ui, -apple-system, sans-serif" };
const headerStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" };
const headlineStyle: React.CSSProperties = { fontWeight: 600 };
const jobIdStyle: React.CSSProperties = { fontSize: 11, color: BULK_COLORS.mutedFg, fontFamily: "ui-monospace, monospace", padding: "1px 6px", background: BULK_COLORS.surfaceFill, borderRadius: 3 };
const statusBadgeStyle: React.CSSProperties = { fontSize: 11, padding: "2px 8px", borderRadius: 10, textTransform: "lowercase" };
const statusColors: Record<string, React.CSSProperties> = {
  completed:   { background: BULK_STATUS_BG.completed,   color: BULK_COLORS.applyGreen },
  cancelled:   { background: BULK_STATUS_BG.cancelled,   color: BULK_COLORS.warnYellow },
  failed:      { background: BULK_STATUS_BG.failed,      color: BULK_COLORS.destructiveRed },
  rolled_back: { background: BULK_STATUS_BG.rolled_back, color: BULK_COLORS.rollbackBlue },
};
const detailsStyle: React.CSSProperties = { marginTop: 6 };
const rowStyle: React.CSSProperties = { padding: "3px 0", borderBottom: `1px dotted ${BULK_COLORS.borderGray}`, fontSize: 12 };
const rowAppliedStyle: React.CSSProperties = { color: BULK_COLORS.applyGreen };
const rowFailedStyle: React.CSSProperties = { color: BULK_COLORS.destructiveRed };
const rowSkippedStyle: React.CSSProperties = { color: BULK_COLORS.warnYellow };
const actionRowStyle: React.CSSProperties = { marginTop: 8, paddingTop: 8, borderTop: `1px solid ${BULK_COLORS.borderGray}` };
const buttonStyle: React.CSSProperties = { fontSize: 12, padding: "4px 10px", border: `1px solid ${BULK_COLORS.primaryBlue}`, color: BULK_COLORS.primaryBlue, background: "#fff", borderRadius: 4, cursor: "pointer" };

export type BulkSummaryCardProps = {
  /** Tool-result-driven render: from rollback tool result (still synchronous in 4-B). */
  result?: unknown;
  /** Polling-driven render: from useJobPolling terminal state (Plan 4-B). */
  pollingJob?: Job;
  /**
   * Programmatic chat-message injection (e.g. fires "rollback job <id>" when the user clicks
   * the Rollback button). If absent, the rollback button is hidden — the card still renders.
   */
  onSendChat?: (text: string) => void;
};

function rowColor(status: string): React.CSSProperties {
  if (status === "applied" || status === "rolled_back") return rowAppliedStyle;
  if (status === "failed") return rowFailedStyle;
  return rowSkippedStyle;
}

export function BulkSummaryCard({ result, pollingJob, onSendChat }: BulkSummaryCardProps) {
  let summary: FormattedBulkSummary;
  try {
    summary = pollingJob !== undefined
      ? formatBulkSummaryFromJob(pollingJob)
      : formatBulkSummary(result);
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
              {r.detail && <span style={{ color: BULK_COLORS.mutedFg, marginLeft: 6 }}>{r.detail}</span>}
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
