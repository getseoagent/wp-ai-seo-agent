import type { Job } from "../hooks/useJobPolling";
import { BULK_COLORS } from "./bulk-styles";
import { __, sprintf } from "../lib/i18n";

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
  // Translators: %1$d = total pages in job, %2$d = pages done, %3$d = total again
  const headline = sprintf(
    __("Last bulk job (%1$d pages) finished while you were away — %2$d/%3$d done"),
    job.total, job.done, job.total,
  );
  // Translators: %d = failed page count
  const failedSuffix = job.failed_count > 0 ? sprintf(__(", %d failed"), job.failed_count) : "";
  return (
    <div style={wrapStyle}>
      <span>{headline}{failedSuffix}.</span>
      <button style={viewBtnStyle} onClick={() => onView(job)}>{__("View summary")}</button>
      <button style={dismissBtnStyle} aria-label={__("Dismiss")} onClick={onDismiss}>×</button>
    </div>
  );
}
