import { describe, expect, it } from "bun:test";
import { CraftError, composeRewrite } from "../lib/craft";
import type { PostSummary } from "../lib/wp-client";

describe("CraftError", () => {
  it("carries reason and detail", () => {
    const err = new CraftError("invalid_json", "model returned non-JSON");
    expect(err.reason).toBe("invalid_json");
    expect(err.detail).toBe("model returned non-JSON");
    expect(err.message).toBe("model returned non-JSON");
    expect(err).toBeInstanceOf(Error);
  });

  it("supports all reason variants", () => {
    const reasons = ["invalid_json", "length_violation", "api_error", "post_not_found"] as const;
    reasons.forEach(r => {
      const e = new CraftError(r, "x");
      expect(e.reason).toBe(r);
    });
  });
});

const baseSummary: PostSummary = {
  id: 42, post_title: "Long tail keywords", slug: "long-tail-keywords",
  status: "publish", modified: "2026-01-01 00:00:00", word_count: 800,
  content_preview: "A guide to long tail keywords for SEO.",
  current_seo: { title: null, description: null, focus_keyword: null, og_title: null },
};

const validProposal = {
  post_id: 42,
  intent: "informational",
  primary_keyword: { text: "long tail keywords", volume: null, source: "llm_estimate" },
  synonym: "long-tail search terms",
  title:       { old: null, new: "Long Tail Keywords: A Complete SEO Guide", length: 40 },
  description: { old: null, new: "Discover how long-tail search terms boost SEO with lower competition. Read our full guide.", length: 91 },
  focus_keyword: { old: null, new: "long tail keywords" },
  reasoning: "Informational how-to. Title leads with keyword.",
};

function makeFakeSdk(responses: Array<string | Error>) {
  let idx = 0;
  const calls: any[] = [];
  return {
    sdk: {
      messages: {
        create: async (req: any) => {
          calls.push(req);
          const next = responses[idx++];
          if (next instanceof Error) throw next;
          return {
            content: [{ type: "text", text: next }],
            usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0 },
          };
        },
      },
    },
    calls,
  };
}

describe("composeRewrite", () => {
  it("sends correctly-shaped Anthropic request", async () => {
    const { sdk, calls } = makeFakeSdk([JSON.stringify(validProposal)]);
    const result = await composeRewrite(baseSummary, undefined, "fake-key", sdk as any);

    expect(calls.length).toBe(1);
    const req = calls[0];
    expect(req.model).toBe("claude-sonnet-4-6");
    expect(req.temperature).toBe(0.3);
    expect(req.system).toBeDefined();
    if (Array.isArray(req.system)) {
      expect(req.system[0].cache_control).toEqual({ type: "ephemeral" });
    }
    expect(req.messages[0].content).toContain("<post>");
    expect(result.title.length).toBe(40);
    expect(result.title.new).toContain("Long Tail Keywords");
  });

  it("includes <additional_constraints> when styleHints provided", async () => {
    const { sdk, calls } = makeFakeSdk([JSON.stringify(validProposal)]);
    await composeRewrite(baseSummary, "more aggressive", "k", sdk as any);
    expect(calls[0].messages[0].content).toContain("<additional_constraints>");
    expect(calls[0].messages[0].content).toContain("more aggressive");
  });

  it("truncates styleHints to 1024 chars in user message", async () => {
    const { sdk, calls } = makeFakeSdk([JSON.stringify(validProposal)]);
    const long = "X".repeat(2000);
    await composeRewrite(baseSummary, long, "k", sdk as any);
    const msg: string = calls[0].messages[0].content;
    const m = msg.match(/<additional_constraints>(.*?)<\/additional_constraints>/s);
    expect(m).not.toBeNull();
    expect(m![1].length).toBeLessThanOrEqual(1024);
  });

  it("recomputes length fields server-side from new strings", async () => {
    const lyingProposal = { ...validProposal, title: { ...validProposal.title, length: 999 } };
    const { sdk } = makeFakeSdk([JSON.stringify(lyingProposal)]);
    const result = await composeRewrite(baseSummary, undefined, "k", sdk as any);
    expect(result.title.length).toBe(result.title.new.length);
    expect(result.title.length).not.toBe(999);
  });

  it("retries once on invalid JSON, then throws CraftError", async () => {
    const { sdk, calls } = makeFakeSdk(["not json", "still not json"]);
    await expect(composeRewrite(baseSummary, undefined, "k", sdk as any)).rejects.toMatchObject({
      reason: "invalid_json",
    });
    expect(calls.length).toBe(2);
    expect(calls[1].messages.length).toBeGreaterThan(calls[0].messages.length);
  });

  it("succeeds on retry after one invalid JSON", async () => {
    const { sdk, calls } = makeFakeSdk(["not json", JSON.stringify(validProposal)]);
    const result = await composeRewrite(baseSummary, undefined, "k", sdk as any);
    expect(calls.length).toBe(2);
    expect(result.post_id).toBe(42);
  });

  it("throws length_violation without retry on title > 60", async () => {
    const tooLong = { ...validProposal, title: { old: null, new: "X".repeat(80), length: 80 } };
    const { sdk, calls } = makeFakeSdk([JSON.stringify(tooLong), JSON.stringify(validProposal)]);
    await expect(composeRewrite(baseSummary, undefined, "k", sdk as any)).rejects.toMatchObject({
      reason: "length_violation",
    });
    expect(calls.length).toBe(1);
  });

  it("throws length_violation on description > 155", async () => {
    const tooLong = { ...validProposal, description: { old: null, new: "X".repeat(200), length: 200 } };
    const { sdk } = makeFakeSdk([JSON.stringify(tooLong)]);
    await expect(composeRewrite(baseSummary, undefined, "k", sdk as any)).rejects.toMatchObject({
      reason: "length_violation",
    });
  });

  it("retries once on api_error, then throws", async () => {
    const apiErr = new Error("503 service unavailable");
    const { sdk, calls } = makeFakeSdk([apiErr, apiErr]);
    await expect(composeRewrite(baseSummary, undefined, "k", sdk as any)).rejects.toMatchObject({
      reason: "api_error",
    });
    expect(calls.length).toBe(2);
  });

  it("succeeds on retry after one api_error", async () => {
    const apiErr = new Error("503");
    const { sdk, calls } = makeFakeSdk([apiErr, JSON.stringify(validProposal)]);
    const result = await composeRewrite(baseSummary, undefined, "k", sdk as any);
    expect(calls.length).toBe(2);
    expect(result.post_id).toBe(42);
  });
});
