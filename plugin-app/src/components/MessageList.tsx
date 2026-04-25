export type Message = { role: "user" | "assistant"; text: string };

export function MessageList({ messages }: { messages: Message[] }) {
  return (
    <div style={{ border: "1px solid #ccc", padding: 12, minHeight: 240, marginBottom: 8 }}>
      {messages.map((m, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <strong>{m.role}:</strong>
          <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
        </div>
      ))}
    </div>
  );
}
