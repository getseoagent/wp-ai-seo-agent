import { dispatchTool, type Tool } from "./tools";
import type { WpClient } from "./wp-client";
import type { SseEvent } from "./sse";
import type { CraftDeps } from "./craft";

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

    const stream = args.client.stream({ model, messages, tools: args.tools, signal: args.signal });
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

    const toolResultBlocks: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = [];
    for (const tu of toolUses) {
      yield { type: "tool_call", id: tu.id, name: tu.name, args: tu.input };
      let resultJson: string;
      try {
        const result = await dispatchTool(tu.name, tu.input, args.wp, args.signal, args.craft);
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
