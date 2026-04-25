import { useState } from "react";

export function MessageInput({ onSend, disabled }: { onSend: (text: string) => void; disabled: boolean }) {
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim() === "") return;
        onSend(text);
        setText("");
      }}
    >
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ask the agent..."
        disabled={disabled}
        style={{ width: "70%", padding: 8 }}
      />
      <button type="submit" disabled={disabled} className="button button-primary" style={{ marginLeft: 8 }}>
        Send
      </button>
    </form>
  );
}
