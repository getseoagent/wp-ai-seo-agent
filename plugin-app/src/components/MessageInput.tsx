import { useState } from "react";
import { __ } from "../lib/i18n";

// WP-style visually-hidden helper so the input's <label> is read by screen
// readers without occupying any visual space (the placeholder remains the
// sighted-user affordance).
const visuallyHidden: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  border: 0,
};

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
      <label htmlFor="seo-agent-chat-input" style={visuallyHidden}>
        {__("Message to the SEO agent")}
      </label>
      <input
        id="seo-agent-chat-input"
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={__("Ask the agent…")}
        disabled={disabled}
        aria-disabled={disabled}
        style={{ width: "70%", padding: 8 }}
      />
      <button type="submit" disabled={disabled} className="button button-primary" style={{ marginLeft: 8 }}>
        {__("Send")}
      </button>
    </form>
  );
}
