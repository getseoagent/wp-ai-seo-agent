import { useCallback, useEffect, useRef, useState } from "react";

export type SseEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; id: string; name: string; args: unknown }
  | { type: "tool_result"; id: string; result: unknown }
  | { type: "error"; message: string }
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

export type ProgressState = {
  done: number;
  total: number;
  failed: number;
  currentPostId?: number;
  currentPostTitle?: string;
};

export function parseSseChunks(buffer: string): { events: SseEvent[]; remainder: string } {
  const events: SseEvent[] = [];
  const parts = buffer.split(/\r?\n\r?\n/);
  const remainder = parts.pop() ?? "";
  for (const part of parts) {
    const dataLine = part.split(/\r?\n/).find((l) => l.startsWith("data: "));
    if (!dataLine) continue;
    const json = dataLine.slice("data: ".length);
    try {
      events.push(JSON.parse(json) as SseEvent);
    } catch {
      // ignore malformed event
    }
  }
  return { events, remainder };
}

type Args = {
  endpoint: string;
  nonce: string;
  sessionId: string;
  onDelta: (delta: string) => void;
  onToolCall: (id: string, name: string, args: unknown) => void;
  onToolResult: (id: string, result: unknown) => void;
  onError: (message: string) => void;
  /**
   * Plan 4-B: opportunistic SSE patch. Fires on each bulk_progress event
   * arriving over the chat stream so consumers (Chat.tsx) can apply an
   * optimistic update to useJobPolling state for smoother bar movement
   * between 2s polls. Polling is still source of truth on conflict.
   */
  onBulkProgress?: (jobId: string, patch: { done: number; total: number; failed_count: number; current_post_id: number | null; current_post_title: string | null }) => void;
};

export function useSseChat({ endpoint, nonce, sessionId, onDelta, onToolCall, onToolResult, onError, onBulkProgress }: Args) {
  const [busy, setBusy] = useState(false);
  const [progressByJobId, setProgressByJobId] = useState<Map<string, ProgressState>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (message: string) => {
      if (busy) return;
      setBusy(true);
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-wp-nonce": nonce,
          },
          credentials: "same-origin",
          body: JSON.stringify({ session_id: sessionId, message }),
          signal: ac.signal,
        });
        if (!res.ok || !res.body) {
          onError(`HTTP ${res.status}`);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const { events, remainder } = parseSseChunks(buf);
          buf = remainder;
          for (const ev of events) {
            if (ev.type === "text") {
              onDelta(ev.delta);
            } else if (ev.type === "tool_call") {
              onToolCall(ev.id, ev.name, ev.args);
            } else if (ev.type === "tool_result") {
              const result = ev.result as { job_id?: string };
              // Any tool result that carries a `job_id` ends progress tracking for that job.
              // Today: apply_style_to_batch (UUID, matches a progress key) and rollback
              // (DB row id, harmless no-op). New tools emitting `job_id` should follow this convention.
              if (typeof result?.job_id === "string") {
                setProgressByJobId(prev => {
                  const next = new Map(prev);
                  next.delete(result.job_id!);
                  return next;
                });
              }
              onToolResult(ev.id, ev.result);
            } else if (ev.type === "error") {
              onError(ev.message);
            } else if (ev.type === "bulk_progress") {
              setProgressByJobId(prev => {
                const next = new Map(prev);
                next.set(ev.job_id, {
                  done: ev.done,
                  total: ev.total,
                  failed: ev.failed,
                  currentPostId: ev.current_post_id,
                  currentPostTitle: ev.current_post_title,
                });
                return next;
              });
              // Plan 4-B: opportunistically patch useJobPolling state too.
              onBulkProgress?.(ev.job_id, {
                done: ev.done,
                total: ev.total,
                failed_count: ev.failed,
                current_post_id: ev.current_post_id ?? null,
                current_post_title: ev.current_post_title ?? null,
              });
              // don't fold into chat messages
            }
            // 'done' is ignored — the stream ending IS the done signal
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          onError((err as Error).message);
        }
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [endpoint, nonce, sessionId, busy, onDelta, onToolCall, onToolResult, onError, onBulkProgress]
  );

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  // Unmount cleanup: abort any in-flight stream so the fetch + reader loop
  // bail out instead of running to completion against a torn-down component
  // (React's "setState on unmounted" warning + a stranded TCP connection).
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  return { send, cancel, busy, progressByJobId };
}
