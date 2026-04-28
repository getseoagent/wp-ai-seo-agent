import { useState } from "react";
import { formatRewriteCard, type FormattedProposal, type FormattedFailure, type ProposalField, type RawProposal, type RawFailure } from "./format-rewrite";

const containerStyle: React.CSSProperties = {
  border: "1px solid #dbe4ec",
  background: "#fff",
  borderRadius: 6,
  padding: 10,
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontSize: 13,
  color: "#1d2327",
};

const sectionHeaderStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: "#50575e",
  marginBottom: 8,
};

const proposalBlockStyle: React.CSSProperties = {
  border: "1px solid #dbe4ec",
  borderRadius: 4,
  padding: 8,
  marginBottom: 8,
  background: "#fafbfc",
};

const proposalHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  marginBottom: 6,
};

const postIdBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  background: "#f0f0f1",
  color: "#50575e",
  borderRadius: 10,
  fontSize: 11,
  fontWeight: 500,
};

const fieldRowStyle: React.CSSProperties = {
  marginBottom: 6,
};

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#646970",
  textTransform: "uppercase",
  letterSpacing: 0.4,
  marginBottom: 2,
};

const oldTextStyle: React.CSSProperties = {
  color: "#a00",
  textDecoration: "line-through",
  fontSize: 12,
  display: "block",
};

const newTextStyle: React.CSSProperties = {
  color: "#2c6e2f",
  fontWeight: 500,
  fontSize: 12,
  display: "block",
  textDecoration: "none",
};

const lengthAnnotationStyle: React.CSSProperties = {
  color: "#646970",
  fontSize: 11,
  marginLeft: 6,
  fontWeight: 400,
};

const reasoningStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  color: "#50575e",
};

const errorsSectionStyle: React.CSSProperties = {
  marginTop: 10,
  background: "#fcf0f1",
  border: "1px solid #f5c2c7",
  color: "#842029",
  borderRadius: 4,
  padding: 8,
};

const errorRowStyle: React.CSSProperties = {
  marginBottom: 4,
  fontSize: 12,
};

const actionRowStyle: React.CSSProperties = { marginTop: 10, paddingTop: 8, borderTop: "1px solid #dbe4ec", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" };
const actionButtonStyle: React.CSSProperties = { fontSize: 12, padding: "4px 10px", border: "1px solid #2271b1", color: "#2271b1", background: "#fff", borderRadius: 4, cursor: "pointer" };
const refineInputStyle: React.CSSProperties = { fontSize: 12, padding: "4px 8px", border: "1px solid #dbe4ec", borderRadius: 4, flex: 1, minWidth: 160 };

const intentStyles: Record<string, React.CSSProperties> = {
  transactional: { background: "#fff8e5", color: "#996800" },
  commercial:    { background: "#e6f7ff", color: "#006399" },
  informational: { background: "#e7f5e7", color: "#2c6e2f" },
  navigational:  { background: "#f3e7ff", color: "#6c3399" },
};

const intentBadgeBaseStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 10,
  fontSize: 11,
  fontWeight: 500,
};

function intentBadgeStyle(intent: string): React.CSSProperties {
  const palette = intentStyles[intent] ?? { background: "#f0f0f1", color: "#50575e" };
  return { ...intentBadgeBaseStyle, ...palette };
}

function isProposalShape(v: unknown): v is RawProposal {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.post_id === "number" &&
    typeof o.intent === "string" &&
    !!o.title && typeof o.title === "object" &&
    !!o.description && typeof o.description === "object" &&
    !!o.focus_keyword && typeof o.focus_keyword === "object"
  );
}

function isFailureShape(v: unknown): v is RawFailure {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.post_id === "number" && typeof o.reason === "string";
}

function tryFormat(result: unknown): { proposals: FormattedProposal[]; failures: FormattedFailure[] } | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  const rawProposalsAll = Array.isArray(r.proposals) ? r.proposals : [];
  const rawFailuresAll  = Array.isArray(r.failures)  ? r.failures  : [];
  // Filter to valid shapes — render the well-formed ones, drop the malformed.
  // Type-guard predicates narrow the arrays so formatRewriteCard sees the
  // RawProposal[] / RawFailure[] it expects without an `as any` shortcut.
  const proposals = rawProposalsAll.filter(isProposalShape);
  const failures  = rawFailuresAll.filter(isFailureShape);
  try {
    return formatRewriteCard({ proposals, failures });
  } catch {
    return null;
  }
}

function FieldRow({ field }: { field: ProposalField }) {
  return (
    <div style={fieldRowStyle}>
      <div style={fieldLabelStyle}>
        {field.label}
        {field.lengthAnnotation && <span style={lengthAnnotationStyle}>{field.lengthAnnotation}</span>}
      </div>
      {field.oldText !== "" && <del style={oldTextStyle}>{field.oldText}</del>}
      <ins style={newTextStyle}>{field.newText}</ins>
    </div>
  );
}

function ProposalBlock({ proposal }: { proposal: FormattedProposal }) {
  return (
    <div style={proposalBlockStyle}>
      <div style={proposalHeaderStyle}>
        <span style={postIdBadgeStyle}>#{proposal.postId}</span>
        <span style={intentBadgeStyle(proposal.intent)}>{proposal.intent}</span>
      </div>
      {proposal.fields.map((f) => <FieldRow key={f.label} field={f} />)}
      {proposal.reasoning && (
        <details style={reasoningStyle}>
          <summary style={{ cursor: "pointer", color: "#646970" }}>reasoning</summary>
          <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{proposal.reasoning}</div>
        </details>
      )}
    </div>
  );
}

function FailureRow({ failure }: { failure: FormattedFailure }) {
  return (
    <div style={errorRowStyle}>
      <strong>#{failure.postId}</strong> — {failure.reason}
      {failure.detail && <span style={{ color: "#5c1a1f" }}>: {failure.detail}</span>}
    </div>
  );
}

export type RewriteCardProps = {
  result: unknown;
  onSendChat?: (text: string) => void;
};

export function RewriteCard({ result, onSendChat }: RewriteCardProps) {
  const [refineText, setRefineText] = useState("");
  const formatted = tryFormat(result);
  if (!formatted) {
    return <div style={containerStyle}>No proposals returned.</div>;
  }
  const { proposals, failures } = formatted;
  if (proposals.length === 0 && failures.length === 0) {
    return <div style={containerStyle}>No proposals returned.</div>;
  }
  return (
    <div style={containerStyle}>
      {proposals.length > 0 && (
        <div>
          <div style={sectionHeaderStyle}>Proposals ({proposals.length})</div>
          {proposals.map((p) => <ProposalBlock key={p.postId} proposal={p} />)}
        </div>
      )}
      {proposals.length > 0 && onSendChat && (
        <div style={actionRowStyle}>
          <button
            style={actionButtonStyle}
            onClick={() => onSendChat(`apply this style to all the remaining posts in the batch`)}
          >
            Apply to remaining posts
          </button>
          <input
            style={refineInputStyle}
            placeholder="refine: e.g. more aggressive, no emoji"
            value={refineText}
            onChange={e => setRefineText(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && refineText.trim()) {
                onSendChat(`re-propose with this style: ${refineText.trim()}`);
                setRefineText("");
              }
            }}
          />
        </div>
      )}
      {failures.length > 0 && (
        <div style={errorsSectionStyle}>
          <div style={{ ...sectionHeaderStyle, color: "#842029", marginBottom: 6 }}>
            Errors ({failures.length})
          </div>
          {failures.map((f, i) => <FailureRow key={`${f.postId}-${i}`} failure={f} />)}
        </div>
      )}
    </div>
  );
}
