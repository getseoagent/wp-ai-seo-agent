import { BULK_COLORS } from "./bulk-styles";
import type { Job } from "../hooks/useJobPolling";
import { __, sprintf } from "../lib/i18n";

const containerStyle: React.CSSProperties = { fontSize: 12, padding: 8, background: BULK_COLORS.surfaceFill, border: `1px solid ${BULK_COLORS.borderGray}`, borderRadius: 6, marginTop: 6 };
const headerStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, marginBottom: 4 };
const progressStyle: React.CSSProperties = { width: "100%", height: 10 };
const statsStyle: React.CSSProperties = { fontSize: 11, color: BULK_COLORS.mutedFg, marginTop: 3 };
// Red outline: destructive mid-flight cancel. Rollback uses blue (post-hoc undo, less catastrophic).
const buttonStyle: React.CSSProperties = { fontSize: 11, padding: "2px 8px", border: `1px solid ${BULK_COLORS.destructiveRed}`, color: BULK_COLORS.destructiveRed, background: "#fff", borderRadius: 4, cursor: "pointer", marginLeft: "auto" };

export type BulkProgressBarProps = {
  job: Job;
  /**
   * Programmatic chat-message injection — fires "cancel job <id>" when user
   * clicks Cancel. If absent, the cancel button is hidden.
   */
  onSendChat?: (text: string) => void;
};

/**
 * Live progress bar for a running bulk job. Reads from useJobPolling state
 * (Plan 4-B): polling is source of truth, SSE bulk_progress events feed in
 * via applyOptimistic for smoother updates between polls.
 */
export function BulkProgressBar({ job, onSendChat }: BulkProgressBarProps) {
  const { id, done, total, failed_count, current_post_title } = job;
  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        {/* Translators: %s = job UUID */}
        <strong>{sprintf(__("Job %s"), id)}</strong>
        {onSendChat && (
          <button style={buttonStyle} onClick={() => onSendChat(`cancel job ${id}`)}>{__("Cancel")}</button>
        )}
      </div>
      <progress style={progressStyle} value={done} max={Math.max(total, 1)} />
      <div style={statsStyle}>
        {/* Translators: %1$d = applied count, %2$d = total */}
        {sprintf(__("%1$d / %2$d applied"), done, total)}
        {failed_count > 0 && (
          <>, <span style={{ color: BULK_COLORS.destructiveRed }}>
            {/* Translators: %d = failed count */}
            {sprintf(__("%d failed"), failed_count)}
          </span></>
        )}
        {current_post_title && <> — {__("current:")} <em>{current_post_title}</em></>}
      </div>
    </div>
  );
}
