import { Component, type ErrorInfo, type ReactNode } from "react";
import { __ } from "../lib/i18n";

type Props  = { children: ReactNode };
type State  = { error: Error | null };

/**
 * App-level error boundary. A bug in any descendant render — a thrown
 * `formatBulkSummary` exception, a malformed `tool_result`, a state
 * desynchronization in a hook — would otherwise blank the entire WP admin
 * panel because React 18 unmounts the tree on uncaught render errors.
 *
 * The fallback shows the actual error message (translators won't see
 * variable text, so it's left raw) plus a "reload" CTA. Errors also go to
 * `console.error` so plugin authors digging in DevTools see the full stack.
 *
 * Limitation: doesn't catch errors thrown in event handlers or async work
 * (those land on `window.onerror`/`onunhandledrejection`). For our chat-app
 * the dominant error surface is render — useSseChat already handles its own
 * fetch failures via onError.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error("[seo-agent] render error:", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div style={fallbackStyle} role="alert">
          <h3 style={{ margin: 0 }}>{__("Something went wrong in the chat panel.")}</h3>
          <p style={{ marginTop: 8 }}>{__("Reload the page to recover. If the problem repeats, copy the error below into a support thread.")}</p>
          <pre style={preStyle}>{this.state.error.message}</pre>
          <button
            type="button"
            className="button"
            onClick={() => window.location.reload()}
          >
            {__("Reload page")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const fallbackStyle: React.CSSProperties = {
  padding: 16,
  marginTop: 12,
  border: "1px solid #d63638",
  background: "#fcf0f1",
  borderRadius: 4,
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontSize: 13,
};
const preStyle: React.CSSProperties = {
  marginTop: 8,
  padding: 8,
  background: "#fff",
  border: "1px solid #ddd",
  borderRadius: 3,
  fontSize: 12,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  maxHeight: 200,
  overflow: "auto",
};
