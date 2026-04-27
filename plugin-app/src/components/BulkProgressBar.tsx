const containerStyle: React.CSSProperties = { fontSize: 12, padding: 8, background: "#f6f7f7", border: "1px solid #dbe4ec", borderRadius: 6, marginTop: 6 };
const headerStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, marginBottom: 4 };
const progressStyle: React.CSSProperties = { width: "100%", height: 10 };
const statsStyle: React.CSSProperties = { fontSize: 11, color: "#646970", marginTop: 3 };
// Red outline: destructive mid-flight cancel. Rollback uses blue (post-hoc undo, less catastrophic).
const buttonStyle: React.CSSProperties = { fontSize: 11, padding: "2px 8px", border: "1px solid #842029", color: "#842029", background: "#fff", borderRadius: 4, cursor: "pointer", marginLeft: "auto" };

export type BulkProgressBarProps = {
  jobId: string;
  progress: { done: number; total: number; failed: number; currentPostTitle?: string };
  onSendChat?: (text: string) => void;
};

export function BulkProgressBar({ jobId, progress, onSendChat }: BulkProgressBarProps) {
  const { done, total, failed, currentPostTitle } = progress;
  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <strong>Job {jobId}</strong>
        {onSendChat && (
          <button style={buttonStyle} onClick={() => onSendChat(`cancel job ${jobId}`)}>Cancel</button>
        )}
      </div>
      <progress style={progressStyle} value={done} max={Math.max(total, 1)} />
      <div style={statsStyle}>
        {done} / {total} applied
        {failed > 0 && <>, <span style={{ color: "#842029" }}>{failed} failed</span></>}
        {currentPostTitle && <> — current: <em>{currentPostTitle}</em></>}
      </div>
    </div>
  );
}
