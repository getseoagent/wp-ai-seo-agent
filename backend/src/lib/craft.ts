import Anthropic from "@anthropic-ai/sdk";
import type { PostSummary } from "./wp-client";
import { CRAFT_SYSTEM_PROMPT, buildUserMessage } from "./craft-prompt";

export type RewriteProposal = {
  post_id: number;
  intent: "informational" | "commercial" | "transactional" | "navigational";
  primary_keyword: { text: string; volume: number | null; source: "llm_estimate" };
  synonym: string;
  title:         { old: string | null; new: string; length: number };
  description:   { old: string | null; new: string; length: number };
  focus_keyword: { old: string | null; new: string };
  reasoning: string;
};

export type RewriteFailure = {
  post_id: number;
  reason: "post_not_found" | "invalid_json" | "length_violation" | "api_error";
  detail?: string;
};

export type CraftReason = RewriteFailure["reason"];

export class CraftError extends Error {
  constructor(public reason: CraftReason, public detail: string) {
    super(detail);
    this.name = "CraftError";
  }
}

export type CraftDeps = {
  composeRewrite: (summary: PostSummary, styleHints: string | undefined) => Promise<RewriteProposal>;
};

const MODEL = "claude-sonnet-4-6";
const TEMPERATURE = 0.3;
const MAX_OUTPUT_TOKENS = 1024;
const MAX_TITLE_LEN = 60;
const MAX_DESC_LEN = 155;
const MAX_HINTS_LEN = 1024;

type SdkLike = {
  messages: {
    create: (req: any) => Promise<{
      content: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
    }>;
  };
};

function isApiError(err: unknown): boolean {
  if (!(err instanceof Error)) return true;
  const msg = err.message.toLowerCase();
  return /50\d|timeout|network|fetch failed|aborted/.test(msg);
}

function parseProposal(text: string, expectedPostId: number): RewriteProposal {
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new CraftError("invalid_json", `parse failed for: ${text.slice(0, 200)}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new CraftError("invalid_json", "not an object");
  }
  const titleNew = String(parsed?.title?.new ?? "");
  const descNew  = String(parsed?.description?.new ?? "");
  if (titleNew.length > MAX_TITLE_LEN) {
    throw new CraftError("length_violation", `title length ${titleNew.length} > ${MAX_TITLE_LEN}`);
  }
  if (descNew.length > MAX_DESC_LEN) {
    throw new CraftError("length_violation", `description length ${descNew.length} > ${MAX_DESC_LEN}`);
  }
  return {
    post_id: expectedPostId,
    intent: parsed.intent,
    primary_keyword: {
      text: String(parsed?.primary_keyword?.text ?? ""),
      volume: parsed?.primary_keyword?.volume ?? null,
      source: "llm_estimate",
    },
    synonym: String(parsed.synonym ?? ""),
    title:         { old: parsed?.title?.old ?? null, new: titleNew, length: titleNew.length },
    description:   { old: parsed?.description?.old ?? null, new: descNew, length: descNew.length },
    focus_keyword: { old: parsed?.focus_keyword?.old ?? null, new: String(parsed?.focus_keyword?.new ?? "") },
    reasoning: String(parsed.reasoning ?? ""),
  };
}

export async function composeRewrite(
  summary: PostSummary,
  styleHints: string | undefined,
  apiKey: string,
  sdkOverride?: SdkLike,
): Promise<RewriteProposal> {
  const sdk: SdkLike = sdkOverride ?? (new Anthropic({ apiKey }) as unknown as SdkLike);
  const trimmedHints = styleHints && styleHints.length > MAX_HINTS_LEN
    ? styleHints.slice(0, MAX_HINTS_LEN)
    : styleHints;
  const userMessage = buildUserMessage(summary, trimmedHints);

  const baseRequest = {
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    temperature: TEMPERATURE,
    system: [
      { type: "text", text: CRAFT_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user" as const, content: userMessage }],
  };

  const startedAt = Date.now();
  let attempt = 0;
  let messages: any[] = baseRequest.messages;
  let lastError: unknown;

  while (attempt < 2) {
    attempt++;
    try {
      const resp = await sdk.messages.create({ ...baseRequest, messages });
      const text = resp.content?.find?.((b: any) => b.type === "text")?.text ?? "";
      try {
        const proposal = parseProposal(text, summary.id);
        const cacheHit = (resp.usage?.cache_read_input_tokens ?? 0) > 0;
        console.log(`[craft] ${JSON.stringify({
          post_id: summary.id,
          duration_ms: Date.now() - startedAt,
          cache_hit: cacheHit,
          tokens_in: resp.usage?.input_tokens ?? 0,
          tokens_out: resp.usage?.output_tokens ?? 0,
          retry_count: attempt - 1,
        })}`);
        return proposal;
      } catch (parseErr) {
        if (parseErr instanceof CraftError && parseErr.reason === "length_violation") {
          throw parseErr;
        }
        if (attempt >= 2) throw parseErr;
        messages = [
          ...messages,
          { role: "assistant", content: text },
          { role: "user", content: "Previous response was not valid JSON. Return strict JSON matching the schema only — no prose, no markdown fence." },
        ];
        lastError = parseErr;
      }
    } catch (err) {
      if (err instanceof CraftError) throw err;
      if (!isApiError(err)) throw err;
      if (attempt >= 2) {
        throw new CraftError("api_error", err instanceof Error ? err.message : String(err));
      }
      lastError = err;
      await new Promise(r => setTimeout(r, 500));
    }
  }
  throw new CraftError("api_error", `unreachable: ${String(lastError)}`);
}

export function makeDefaultCraft(apiKey: string): CraftDeps {
  return {
    composeRewrite: (summary, hints) => composeRewrite(summary, hints, apiKey),
  };
}
