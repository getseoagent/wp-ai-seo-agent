import Anthropic from "@anthropic-ai/sdk";
import type { AgentClient, AssistantBlock, AgentChunk } from "./agent-loop";

export function createAnthropicClient(apiKey: string): AgentClient {
  const sdk = new Anthropic({ apiKey });
  return {
    stream({ model, messages, tools, signal, system }) {
      const stream = sdk.messages.stream(
        {
          model,
          max_tokens: 4096,
          tools: tools as unknown as any,
          messages: messages as unknown as any,
          ...(system !== undefined ? { system } : {}),
        },
        { signal }
      );

      async function* iterator(): AsyncGenerator<AgentChunk> {
        for await (const ev of stream) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            yield { type: "text", delta: ev.delta.text };
          } else {
            yield { type: "ignore" };
          }
        }
      }

      return {
        [Symbol.asyncIterator]: iterator,
        async finalMessage() {
          const final = await stream.finalMessage();
          return {
            content: final.content as unknown as AssistantBlock[],
            stop_reason: String(final.stop_reason),
          };
        },
      };
    },
  };
}
