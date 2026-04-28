export type ProposalField = {
  label: "title" | "description" | "focus_keyword";
  oldText: string;
  newText: string;
  lengthAnnotation?: string;
};

export type FormattedProposal = {
  postId: number;
  intent: string;
  fields: ProposalField[];
  reasoning: string;
};

export type FormattedFailure = {
  postId: number;
  reason: string;
  detail?: string;
};

export type FormattedResult = {
  proposals: FormattedProposal[];
  failures: FormattedFailure[];
};

export type RawProposal = {
  post_id: number;
  intent: string;
  title:         { old: string | null; new: string; length: number };
  description:   { old: string | null; new: string; length: number };
  focus_keyword: { old: string | null; new: string };
  reasoning: string;
};

export type RawFailure = { post_id: number; reason: string; detail?: string };

export function formatRewriteCard(toolResult: { proposals: RawProposal[]; failures: RawFailure[] }): FormattedResult {
  const proposals = (toolResult.proposals ?? []).map((p) => ({
    postId: p.post_id,
    intent: p.intent,
    reasoning: p.reasoning ?? "",
    fields: [
      {
        label: "title" as const,
        oldText: p.title.old ?? "",
        newText: p.title.new,
        lengthAnnotation: `${p.title.length}/60`,
      },
      {
        label: "description" as const,
        oldText: p.description.old ?? "",
        newText: p.description.new,
        lengthAnnotation: `${p.description.length}/155`,
      },
      {
        label: "focus_keyword" as const,
        oldText: p.focus_keyword.old ?? "",
        newText: p.focus_keyword.new,
      },
    ],
  }));
  const failures = (toolResult.failures ?? []).map((f) => ({
    postId: f.post_id,
    reason: f.reason,
    detail: f.detail,
  }));
  return { proposals, failures };
}
