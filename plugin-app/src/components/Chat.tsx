import { useState, useMemo } from "react";
import { MessageList, type ChatItem } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { useSseChat } from "../hooks/useSseChat";
import { BULK_COLORS } from "./bulk-styles";

const typingIndicatorStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8,
  padding: "6px 10px", marginTop: 4,
  fontSize: 12, color: BULK_COLORS.mutedFg,
};
const dotsStyle: React.CSSProperties = {
  fontSize: 16, letterSpacing: 2, color: BULK_COLORS.mutedFg,
};
const typingTextStyle: React.CSSProperties = {
  fontStyle: "italic",
};
const stopButtonStyle: React.CSSProperties = {
  marginLeft: "auto",
  fontSize: 12, padding: "3px 10px",
  border: `1px solid ${BULK_COLORS.destructiveRed}`,
  color: BULK_COLORS.destructiveRed,
  background: "#fff", borderRadius: 4, cursor: "pointer",
};

export function Chat({ restUrl, nonce }: { restUrl: string; nonce: string }) {
  const sessionId = useMemo(
    () => `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    []
  );
  const [items, setItems] = useState<ChatItem[]>([]);

  const appendAssistantDelta = (delta: string) =>
    setItems(prev => {
      const last = prev[prev.length - 1];
      if (!last || last.kind !== "message" || last.message.role !== "assistant") {
        return [...prev, { kind: "message", message: { role: "assistant", text: delta } }];
      }
      return [
        ...prev.slice(0, -1),
        { kind: "message", message: { role: "assistant", text: last.message.text + delta } },
      ];
    });

  const { send, cancel, busy, progressByJobId } = useSseChat({
    endpoint: `${restUrl}/chat`,
    nonce,
    sessionId,
    onDelta: appendAssistantDelta,
    onToolCall: (id, name, args) =>
      setItems(prev => [...prev, { kind: "tool", tool: { id, name, args } }]),
    onToolResult: (id, result) =>
      setItems(prev =>
        prev.map(it =>
          it.kind === "tool" && it.tool.id === id ? { kind: "tool", tool: { ...it.tool, result } } : it
        )
      ),
    onError: msg =>
      setItems(prev => [...prev, { kind: "message", message: { role: "assistant", text: `Error: ${msg}` } }]),
  });

  const handleSend = (text: string) => {
    setItems(prev => [...prev, { kind: "message", message: { role: "user", text } }]);
    send(text);
  };

  return (
    <div>
      <MessageList items={items} progressByJobId={progressByJobId} onSendChat={handleSend} />
      {busy && (
        <div style={typingIndicatorStyle}>
          <span style={dotsStyle}>•••</span>
          <span style={typingTextStyle}>Agent is thinking…</span>
          <button style={stopButtonStyle} onClick={cancel}>Stop</button>
        </div>
      )}
      <MessageInput onSend={handleSend} disabled={busy} />
    </div>
  );
}
