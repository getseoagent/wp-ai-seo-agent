import { Chat } from "./components/Chat";
import { __ } from "./lib/i18n";

declare global {
  interface Window {
    SEO_AGENT?: { restUrl: string; nonce: string; hasKey: boolean };
  }
}

export function App() {
  const config = window.SEO_AGENT;
  if (!config) {
    return <div>{__("Configuration missing.")}</div>;
  }
  if (!config.hasKey) {
    return <div>{__("Set your Anthropic API key in the form above to start chatting.")}</div>;
  }
  return <Chat restUrl={config.restUrl} nonce={config.nonce} />;
}
