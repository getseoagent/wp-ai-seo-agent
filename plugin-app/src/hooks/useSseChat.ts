import { useCallback, useRef, useState } from "react";

export type SseEvent =
  | { type: "text"; delta: string }
  | { type: "error"; message: string }
  | { type: "done" };

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
  onDelta: (delta: string) => void;
  onError: (message: string) => void;
};

export function useSseChat({ endpoint, nonce, onDelta, onError }: Args) {
  const [busy, setBusy] = useState(false);
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
          body: JSON.stringify({ message }),
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
            if (ev.type === "text") onDelta(ev.delta);
            else if (ev.type === "error") onError(ev.message);
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
    [endpoint, nonce, busy, onDelta, onError]
  );

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  return { send, cancel, busy };
}
