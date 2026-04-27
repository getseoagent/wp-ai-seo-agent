import { dispatchTool, type Tool } from "./tools";
import type { WpClient } from "./wp-client";
import type { SseEvent } from "./sse";
import type { CraftDeps } from "./craft";
import { CHAT_SYSTEM_PROMPT } from "./chat-prompt";

export type AssistantBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown };

export type Message =
  | { role: "user"; content: string | Array<{ type: "tool_result"; tool_use_id: string; content: string }> }
  | { role: "assistant"; content: string | AssistantBlock[] };

export type AgentChunk = { type: "text"; delta: string } | { type: "ignore" };

export interface AgentClient {
  stream(input: {
    model: string;
    messages: Message[];
    tools: Tool[];
    signal: AbortSignal;
    system?: string;
  }): {
    [Symbol.asyncIterator](): AsyncIterator<AgentChunk>;
    finalMessage(): Promise<{ content: AssistantBlock[]; stop_reason: string }>;
  };
}

export type RunAgentArgs = {
  messages: Message[];
  wp: WpClient;
  signal: AbortSignal;
  client: AgentClient;
  tools: Tool[];
  model?: string;
  maxIterations?: number;
  craft?: CraftDeps;
  emit?: (ev: SseEvent) => void;
};

export async function* runAgent(args: RunAgentArgs): AsyncGenerator<SseEvent> {
  const model = args.model ?? "claude-sonnet-4-6";
  const max = args.maxIterations ?? 8;
  const messages = [...args.messages];

  for (let iter = 0; iter < max; iter++) {
    if (args.signal.aborted) {
      yield { type: "error", message: "aborted" };
      return;
    }

    const stream = args.client.stream({ model, messages, tools: args.tools, signal: args.signal, system: CHAT_SYSTEM_PROMPT });
    try {
      for await (const chunk of stream) {
        if (chunk.type === "text") yield { type: "text", delta: chunk.delta };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield { type: "error", message: msg };
      return;
    }

    const final = await stream.finalMessage();

    const toolUses = final.content.filter((b): b is Extract<AssistantBlock, {type:"tool_use"}> => b.type === "tool_use");

    if (final.stop_reason !== "tool_use" || toolUses.length === 0) {
      yield { type: "done" };
      return;
    }

    messages.push({ role: "assistant", content: final.content });

    // Split tool_uses into concurrent (Promise.allSettled) vs sequential (for-of)
    // groups. The flag lives on the Tool definition; default is sequential for safety
    // on writes / audit ordering.
    const toolByName = new Map(args.tools.map(t => [t.name, t]));
    const concurrentUses = toolUses.filter(tu => toolByName.get(tu.name)?.concurrent === true);
    const sequentialUses = toolUses.filter(tu => toolByName.get(tu.name)?.concurrent !== true);

    // Emit tool_call SSE events upfront in original toolUses order so the UI's
    // ToolCallCard sequence matches the model's intent. tool_result events follow
    // resolve order, which may differ for the concurrent group.
    for (const tu of toolUses) {
      yield { type: "tool_call", id: tu.id, name: tu.name, args: tu.input };
    }

    const toolResultBlocks: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = [];

    // Concurrent group: dispatch all in parallel. Promise.allSettled means a single
    // rejected dispatch can't sink the whole turn — every tool_use must produce a
    // tool_result (tool_use_id pairing requirement of the Anthropic API).
    const concurrentSettled = await Promise.allSettled(
      concurrentUses.map(tu => dispatchTool(tu.name, tu.input, args.wp, args.signal, args.craft, args.emit))
    );
    for (let i = 0; i < concurrentUses.length; i++) {
      const tu = concurrentUses[i];
      const settled = concurrentSettled[i];
      if (settled.status === "fulfilled") {
        const result = settled.value;
        yield { type: "tool_result", id: tu.id, result };
        toolResultBlocks.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(result) });
      } else {
        const msg = settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
        const errResult = { error: msg };
        yield { type: "tool_result", id: tu.id, result: errResult };
        toolResultBlocks.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(errResult) });
      }
    }

    // Sequential group: keep existing semantics — one at a time, full audit ordering.
    // Writes and stateful tools live here (update_seo_fields, rollback,
    // apply_style_to_batch, cancel_job).
    for (const tu of sequentialUses) {
      let resultJson: string;
      try {
        const result = await dispatchTool(tu.name, tu.input, args.wp, args.signal, args.craft, args.emit);
        resultJson = JSON.stringify(result);
        yield { type: "tool_result", id: tu.id, result };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        resultJson = JSON.stringify({ error: msg });
        yield { type: "tool_result", id: tu.id, result: { error: msg } };
      }
      toolResultBlocks.push({ type: "tool_result", tool_use_id: tu.id, content: resultJson });
    }

    messages.push({ role: "user", content: toolResultBlocks });
  }

  yield { type: "error", message: "iteration cap reached" };
}
