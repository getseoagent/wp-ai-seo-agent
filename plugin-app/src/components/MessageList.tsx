import { ToolCallCard, type ToolCall } from "./ToolCallCard";
import { __ } from "../lib/i18n";

export type Message = { role: "user" | "assistant"; text: string };
export type ChatItem =
  | { kind: "message"; message: Message }
  | { kind: "tool"; tool: ToolCall };

const containerStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #c3c4c7",
  borderRadius: 6,
  boxShadow: "0 1px 1px rgba(0,0,0,0.04)",
  padding: 16,
  minHeight: 280,
  marginBottom: 12,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const bubbleBase: React.CSSProperties = {
  maxWidth: "78%",
  padding: "8px 12px",
  borderRadius: 10,
  lineHeight: 1.45,
  fontSize: 14,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const userBubble: React.CSSProperties = {
  ...bubbleBase,
  alignSelf: "flex-end",
  background: "#2271b1",
  color: "#fff",
  borderBottomRightRadius: 2,
};

const assistantBubble: React.CSSProperties = {
  ...bubbleBase,
  alignSelf: "flex-start",
  background: "#f0f6fc",
  color: "#1d2327",
  border: "1px solid #dbe4ec",
  borderBottomLeftRadius: 2,
};

const emptyHintStyle: React.CSSProperties = {
  margin: "auto",
  color: "#646970",
  fontStyle: "italic",
  fontSize: 13,
};

const rowBase: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const labelBase: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: "#646970",
  fontWeight: 600,
};

type MessageListProps = {
  items: ChatItem[];
  onSendChat?: (text: string) => void;
};

export function MessageList({ items, onSendChat }: MessageListProps) {
  return (
    // role="log" + aria-live="polite" tells screen readers to announce new
    // entries as they're appended (incoming streamed text + tool calls)
    // without interrupting the user mid-action. aria-relevant="additions"
    // narrows to "only announce new content, not re-announce on re-render".
    <div
      style={containerStyle}
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      aria-label={__("Chat history")}
    >
      {items.length === 0 ? (
        <div style={emptyHintStyle}>{__("No messages yet — say hi to test the pipe.")}</div>
      ) : (
        items.map((it, i) => {
          if (it.kind === "tool") return <ToolCallCard key={i} call={it.tool} onSendChat={onSendChat} />;
          const isUser = it.message.role === "user";
          return (
            <div key={i} style={{ ...rowBase, alignItems: isUser ? "flex-end" : "flex-start" }}>
              <div style={labelBase}>{isUser ? __("You") : __("Agent")}</div>
              <div style={isUser ? userBubble : assistantBubble}>{it.message.text}</div>
            </div>
          );
        })
      )}
    </div>
  );
}
