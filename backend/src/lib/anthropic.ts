import Anthropic from "@anthropic-ai/sdk";

export type StreamFn = (args: {
  apiKey: string;
  message: string;
}) => AsyncGenerator<string, void, unknown>;

export const anthropicStream: StreamFn = async function* ({ apiKey, message }) {
  const client = new Anthropic({ apiKey });
  const stream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: message }],
  });
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
};
