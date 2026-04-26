import { describe, expect, it } from "vitest";
import { formatRewriteCard } from "./format-rewrite";

const proposal = {
  post_id: 42,
  intent: "transactional",
  primary_keyword: { text: "kw", volume: null, source: "llm_estimate" },
  synonym: "syn",
  title:         { old: "old title", new: "new title 47 chars long padded out aaaaaaaaaaaaaaa", length: 47 },
  description:   { old: "old desc", new: "new desc text", length: 13 },
  focus_keyword: { old: "kw-old", new: "kw-new" },
  reasoning: "some reasoning text",
};

describe("formatRewriteCard", () => {
  it("returns N proposals when input has N", () => {
    const out = formatRewriteCard({ proposals: [proposal, proposal], failures: [] });
    expect(out.proposals).toHaveLength(2);
    expect(out.failures).toHaveLength(0);
  });

  it("formats lengthAnnotation as 'used/max' for title and description", () => {
    const out = formatRewriteCard({ proposals: [proposal], failures: [] });
    const fields = out.proposals[0].fields;
    const titleField = fields.find(f => f.label === "title");
    const descField  = fields.find(f => f.label === "description");
    expect(titleField?.lengthAnnotation).toBe("47/60");
    expect(descField?.lengthAnnotation).toBe("13/155");
  });

  it("focus_keyword field has no lengthAnnotation", () => {
    const out = formatRewriteCard({ proposals: [proposal], failures: [] });
    const fk = out.proposals[0].fields.find(f => f.label === "focus_keyword");
    expect(fk?.lengthAnnotation).toBeUndefined();
  });

  it("preserves reasoning and intent", () => {
    const out = formatRewriteCard({ proposals: [proposal], failures: [] });
    expect(out.proposals[0].intent).toBe("transactional");
    expect(out.proposals[0].reasoning).toBe("some reasoning text");
    expect(out.proposals[0].postId).toBe(42);
  });

  it("renders empty proposals + failures only", () => {
    const out = formatRewriteCard({
      proposals: [],
      failures: [{ post_id: 99, reason: "post_not_found", detail: "x" }],
    });
    expect(out.proposals).toHaveLength(0);
    expect(out.failures).toHaveLength(1);
    expect(out.failures[0]).toEqual({ postId: 99, reason: "post_not_found", detail: "x" });
  });

  it("handles null old values (renders as empty string)", () => {
    const fresh = { ...proposal, title: { old: null, new: "x", length: 1 } };
    const out = formatRewriteCard({ proposals: [fresh], failures: [] });
    const titleField = out.proposals[0].fields.find(f => f.label === "title");
    expect(titleField?.oldText).toBe("");
    expect(titleField?.newText).toBe("x");
  });
});
