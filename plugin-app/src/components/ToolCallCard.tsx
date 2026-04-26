import { useState } from "react";
import { RewriteCard } from "./RewriteCard";

export type ToolCall = {
  id: string;
  name: string;
  args: unknown;
  result?: unknown;
};

const cardStyle: React.CSSProperties = {
  alignSelf: "flex-start",
  maxWidth: "78%",
  background: "#f6f7f7",
  border: "1px solid #dbe4ec",
  borderRadius: 8,
  fontSize: 12,
  fontFamily: "ui-monospace, SFMono-Regular, monospace",
  color: "#1d2327",
};

const headerStyle: React.CSSProperties = {
  padding: "6px 10px",
  display: "flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
  userSelect: "none",
};

const bodyStyle: React.CSSProperties = {
  borderTop: "1px solid #dbe4ec",
  padding: "8px 10px",
  whiteSpace: "pre-wrap",
  maxHeight: 200,
  overflow: "auto",
};

function summarize(args: unknown): string {
  if (args === null || typeof args !== "object") return "";
  const entries = Object.entries(args as Record<string, unknown>);
  if (entries.length === 0) return "()";
  const inside = entries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ");
  return `(${inside.length > 60 ? inside.slice(0, 57) + "…" : inside})`;
}

export function ToolCallCard({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(false);
  const status = call.result === undefined ? "…" : "✓";
  return (
    <div style={cardStyle}>
      <div style={headerStyle} onClick={() => setOpen(o => !o)}>
        <span>{status}</span>
        <strong>{call.name}</strong>
        <span>{summarize(call.args)}</span>
        <span style={{ marginLeft: "auto", color: "#646970" }}>{open ? "▾" : "▸"}</span>
      </div>
      {open && (
        <div style={bodyStyle}>
          <div><strong>args</strong></div>
          <div>{JSON.stringify(call.args, null, 2)}</div>
          {call.result !== undefined && (
            <>
              <div style={{ marginTop: 8 }}><strong>result</strong></div>
              {call.name === "propose_seo_rewrites"
                ? <RewriteCard result={call.result} />
                : <div>{JSON.stringify(call.result, null, 2)}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
