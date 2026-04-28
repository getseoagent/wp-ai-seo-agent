export type SseEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; id: string; name: string; args: unknown }
  | { type: "tool_result"; id: string; result: unknown }
  | {
      type: "error";
      /** Human-readable, already-translated message for display. */
      message: string;
      /** Stable categorical code so the UI can branch (link to docs, retry button, etc.). */
      code?:
        | "anthropic_auth"          // 401 from Anthropic — bad/expired key
        | "anthropic_rate_limit"    // 429 from Anthropic — slow down
        | "anthropic_quota"         // 402 / payment required
        | "anthropic_overloaded"    // 529 — Anthropic capacity issue
        | "anthropic_other"         // any other Anthropic 4xx/5xx we don't model yet
        | "aborted"                 // user / signal aborted
        | "iteration_cap"           // agent loop hit its hard cap
        | "internal";               // catch-all
      /** Optional self-help link the UI can offer. */
      help_url?: string;
    }
  | { type: "done" }
  | {
      type: "bulk_progress";
      job_id: string;
      done: number;
      total: number;
      failed: number;
      current_post_id?: number;
      current_post_title?: string;
    };

export function sseFormat(event: SseEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/**
 * Map a thrown error from the Anthropic SDK (or anything else escaping the
 * agent loop) into a structured SSE error event that the UI can render with
 * actionable copy + a help URL. Falls through to {code:"internal"} for
 * unknown shapes so we never display raw stacks to end users.
 */
export function classifyError(err: unknown): Extract<SseEvent, { type: "error" }> {
  const raw = err instanceof Error ? err.message : String(err);

  // Anthropic SDK throws with `status` and a JSON-stringified body in the
  // message; pattern-match by status code first, then by error.type fallback.
  const statusMatch = /(?:^|\b)(\d{3})\b/.exec(raw);
  const status = statusMatch ? Number(statusMatch[1]) : 0;
  const lower  = raw.toLowerCase();

  if (status === 401 || lower.includes("authentication_error") || lower.includes("invalid x-api-key")) {
    return {
      type: "error",
      code: "anthropic_auth",
      message: "Your Anthropic API key is invalid or expired. Update it in SEO Agent → Settings.",
      help_url: "https://console.anthropic.com/settings/keys",
    };
  }
  if (status === 429 || lower.includes("rate_limit_error") || lower.includes("rate_limit")) {
    return {
      type: "error",
      code: "anthropic_rate_limit",
      message: "Anthropic rate-limited this request. Wait ~30 seconds and retry; bulk runs may also need a higher Anthropic tier.",
      help_url: "https://docs.anthropic.com/en/api/rate-limits",
    };
  }
  if (status === 402 || lower.includes("billing") || lower.includes("credit_balance_too_low")) {
    return {
      type: "error",
      code: "anthropic_quota",
      message: "Your Anthropic account is out of credit. Top up at console.anthropic.com → Plans & billing.",
      help_url: "https://console.anthropic.com/settings/plans",
    };
  }
  if (status === 529 || lower.includes("overloaded")) {
    return {
      type: "error",
      code: "anthropic_overloaded",
      message: "Anthropic's API is temporarily overloaded. Retry in a minute.",
    };
  }
  if (raw === "aborted" || lower.includes("aborterror") || lower.includes("the operation was aborted")) {
    return { type: "error", code: "aborted", message: "Cancelled." };
  }
  if (raw === "iteration cap reached") {
    return {
      type: "error",
      code: "iteration_cap",
      message: "Agent took too many turns to finish. Try a more specific request, or break the work into smaller batches.",
    };
  }
  // Anything 4xx/5xx that's clearly Anthropic but didn't match above.
  if (status >= 400 && status < 600 && (lower.includes('"type":"error"') || lower.includes("anthropic"))) {
    return {
      type: "error",
      code: "anthropic_other",
      message: `Anthropic returned ${status}. Open SEO Agent → Settings → Diagnose, then share the report when filing a support ticket.`,
    };
  }
  return { type: "error", code: "internal", message: raw };
}
