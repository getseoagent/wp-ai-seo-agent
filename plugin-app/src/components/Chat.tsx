import { useState, useMemo } from "react";
import { MessageList, type ChatItem } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { useSseChat } from "../hooks/useSseChat";

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

  const { send, busy } = useSseChat({
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
      <MessageList items={items} />
      <MessageInput onSend={handleSend} disabled={busy} />
    </div>
  );
}
