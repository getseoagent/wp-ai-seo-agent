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

export function sseFormat(event: SseEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
