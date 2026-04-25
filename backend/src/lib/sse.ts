export type SseEvent =
  | { type: "text"; delta: string }
  | { type: "error"; message: string }
  | { type: "done" };

export function sseFormat(event: SseEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
