import type { Job } from "../hooks/useJobPolling";
import { BULK_COLORS } from "./bulk-styles";

const wrapStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12,
  padding: "8px 12px", marginBottom: 8,
  borderRadius: 6,
  background: BULK_COLORS.bannerBg,
  border: `1px solid ${BULK_COLORS.bannerBorder}`,
  fontSize: 13,
};
const viewBtnStyle: React.CSSProperties = {
  background: BULK_COLORS.primaryBlue, color: "#fff", border: 0,
  padding: "4px 10px", borderRadius: 4,
  fontSize: 12, cursor: "pointer",
};
const dismissBtnStyle: React.CSSProperties = {
  marginLeft: "auto",
  background: "transparent", border: 0, cursor: "pointer",
  fontSize: 16, color: BULK_COLORS.mutedFg, lineHeight: 1,
};

type Props = {
  job: Job;
  onView: (job: Job) => void;
  onDismiss: () => void;
};

/**
 * Plan 4-B: surfaces a completed bulk job that finished while the user was
 * away from the chat panel. Click [View summary] to mount the corresponding
 * BulkSummaryCard for that job; click [×] to permanently dismiss this job.
 */
export function RecentJobsBanner({ job, onView, onDismiss }: Props) {
  return (
    <div style={wrapStyle}>
      <span>
        Last bulk job ({job.total} pages) finished while you were away — {job.done}/{job.total} done
        {job.failed_count > 0 ? `, ${job.failed_count} failed` : ""}.
      </span>
      <button style={viewBtnStyle} onClick={() => onView(job)}>View summary</button>
      <button style={dismissBtnStyle} aria-label="Dismiss" onClick={onDismiss}>×</button>
    </div>
  );
}
