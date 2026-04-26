import type { PostSummary } from "./wp-client";

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
