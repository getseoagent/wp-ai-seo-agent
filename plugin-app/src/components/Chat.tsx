import { useState } from "react";
import { MessageList, type Message } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { useSseChat } from "../hooks/useSseChat";

export function Chat({ restUrl, nonce }: { restUrl: string; nonce: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const { send, busy } = useSseChat({
    endpoint: `${restUrl}/chat`,
    nonce,
    onDelta: (delta) =>
      setMessages((prev) => {
        if (prev.length === 0 || prev[prev.length - 1].role !== "assistant") {
          return [...prev, { role: "assistant", text: delta }];
        }
        const last = prev[prev.length - 1];
        return [...prev.slice(0, -1), { ...last, text: last.text + delta }];
      }),
    onError: (msg) =>
      setMessages((prev) => [...prev, { role: "assistant", text: `Error: ${msg}` }]),
  });

  const handleSend = (text: string) => {
    setMessages((prev) => [...prev, { role: "user", text }]);
    send(text);
  };

  return (
    <div>
      <MessageList messages={messages} />
      <MessageInput onSend={handleSend} disabled={busy} />
    </div>
  );
}
