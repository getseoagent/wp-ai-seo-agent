import { describe, expect, it } from "bun:test";
import { tools, dispatchTool } from "../lib/tools";
import type { WpClient } from "../lib/wp-client";
import type { CraftDeps, RewriteProposal } from "../lib/craft";

const fakeWp = {
  listPosts:       async (args: any) => ({ posts: [{ id: 1, post_title: "t", slug: "s", status: "publish", modified: "x" }], next_cursor: null, total: 1 }),
  getPostSummary:  async (id: number) => id === 7 ? { id: 7, post_title: "t", slug: "s", status: "publish", modified: "x", word_count: 0, current_seo: { title: null, description: null, focus_keyword: null, og_title: null } } : null,
  getCategories:   async () => [{ id: 1, name: "n", slug: "s", count: 0 }],
  getTags:         async () => [],
  detectSeoPlugin: async () => ({ name: "rank-math" }),
  updateSeoFields: async (post_id: number, fields: any, job_id?: string) => ({ job_id: job_id ?? "auto", results: [{ field: Object.keys(fields)[0], status: "applied" }] }),
  getHistory:      async (args: any) => ({ rows: [{ id: 1, post_id: args.post_id ?? 1 }], next_cursor: null, total: 1 }),
  rollback:        async (ids: number[]) => ({ job_id: "rj", results: ids.map(id => ({ history_id: id, status: "rolled_back" })) }),
} as unknown as WpClient;

describe("tools", () => {
  it("exposes the new write tool names", () => {
    const names = tools.map(t => t.name).sort();
    expect(names).toEqual(["detect_seo_plugin", "get_categories", "get_history", "get_post_summary", "get_tags", "list_posts", "propose_seo_rewrites", "rollback", "update_seo_fields"]);
  });

  it("each tool has an input_schema", () => {
    for (const t of tools) {
      expect(t.input_schema).toBeDefined();
      expect(t.input_schema.type).toBe("object");
    }
  });

  it("dispatches list_posts", async () => {
    const out = await dispatchTool("list_posts", { limit: 5 }, fakeWp);
    expect(out).toMatchObject({ posts: expect.any(Array) });
  });

  it("dispatches get_post_summary", async () => {
    const out = await dispatchTool("get_post_summary", { id: 7 }, fakeWp);
    expect((out as any).id).toBe(7);
  });

  it("throws on unknown tool", async () => {
    await expect(dispatchTool("bogus", {}, fakeWp)).rejects.toThrow(/unknown tool/);
  });

  it("dispatches update_seo_fields", async () => {
    const out: any = await dispatchTool("update_seo_fields", { post_id: 42, fields: { title: "X" } }, fakeWp);
    expect(out.job_id).toBe("auto");
    expect(out.results[0].field).toBe("title");
  });

  it("dispatches update_seo_fields with explicit job_id", async () => {
    const out: any = await dispatchTool("update_seo_fields", { post_id: 42, job_id: "j-1", fields: { title: "X" } }, fakeWp);
    expect(out.job_id).toBe("j-1");
  });

  it("dispatches get_history", async () => {
    const out: any = await dispatchTool("get_history", { post_id: 42, limit: 10 }, fakeWp);
    expect(out.rows[0].post_id).toBe(42);
  });

  it("dispatches rollback", async () => {
    const out: any = await dispatchTool("rollback", { history_ids: [17, 18] }, fakeWp);
    expect(out.results).toHaveLength(2);
    expect(out.results[0].history_id).toBe(17);
  });

  it("update_seo_fields schema requires post_id and fields", () => {
    const tool = tools.find(t => t.name === "update_seo_fields")!;
    expect(tool.input_schema.required).toEqual(["post_id", "fields"]);
  });

  it("rollback schema caps maxItems at 50", () => {
    const tool = tools.find(t => t.name === "rollback")!;
    const props = tool.input_schema.properties as any;
    expect(props.history_ids.maxItems).toBe(50);
  });
});

const stubProposal = (id: number): RewriteProposal => ({
  post_id: id,
  intent: "informational",
  primary_keyword: { text: "kw", volume: null, source: "llm_estimate" },
  synonym: "syn",
  title:         { old: null, new: "T".repeat(20), length: 20 },
  description:   { old: null, new: "D".repeat(50), length: 50 },
  focus_keyword: { old: null, new: "kw" },
  reasoning: "r",
});

const summary = {
  id: 1, post_title: "t", slug: "s", status: "publish", modified: "x",
  word_count: 0, content_preview: "c",
  current_seo: { title: null, description: null, focus_keyword: null, og_title: null },
};

const fakeWpForCraft = {
  ...fakeWp,
  getPostSummary: async (id: number) => id === 99 ? null : { ...summary, id },
};

describe("propose_seo_rewrites tool", () => {
  it("is registered in tools array", () => {
    expect(tools.some(t => t.name === "propose_seo_rewrites")).toBe(true);
  });

  it("returns proposals for all ids when craft succeeds", async () => {
    const craft: CraftDeps = { composeRewrite: async (s) => stubProposal(s.id) };
    const out: any = await dispatchTool(
      "propose_seo_rewrites",
      { post_ids: [1, 2, 3] },
      fakeWpForCraft as any,
      undefined,
      craft,
    );
    expect(out.proposals).toHaveLength(3);
    expect(out.failures).toHaveLength(0);
    expect(out.proposals[0].post_id).toBe(1);
  });

  it("partial result when one summary is missing", async () => {
    const craft: CraftDeps = { composeRewrite: async (s) => stubProposal(s.id) };
    const out: any = await dispatchTool(
      "propose_seo_rewrites",
      { post_ids: [1, 99, 3] },
      fakeWpForCraft as any,
      undefined,
      craft,
    );
    expect(out.proposals).toHaveLength(2);
    expect(out.failures).toHaveLength(1);
    expect(out.failures[0]).toMatchObject({ post_id: 99, reason: "post_not_found" });
  });

  it("partial result when craft throws on one", async () => {
    const craft: CraftDeps = {
      composeRewrite: async (s) => {
        if (s.id === 2) throw new (await import("../lib/craft")).CraftError("api_error", "boom");
        return stubProposal(s.id);
      },
    };
    const out: any = await dispatchTool(
      "propose_seo_rewrites",
      { post_ids: [1, 2, 3] },
      fakeWpForCraft as any,
      undefined,
      craft,
    );
    expect(out.proposals).toHaveLength(2);
    expect(out.failures).toHaveLength(1);
    expect(out.failures[0]).toMatchObject({ post_id: 2, reason: "api_error" });
  });

  it("rejects post_ids.length > 20", async () => {
    let craftCalled = 0;
    const craft: CraftDeps = { composeRewrite: async (s) => { craftCalled++; return stubProposal(s.id); } };
    const ids = Array.from({ length: 21 }, (_, i) => i + 1);
    const out: any = await dispatchTool(
      "propose_seo_rewrites",
      { post_ids: ids },
      fakeWpForCraft as any,
      undefined,
      craft,
    );
    expect(out.error).toMatch(/preview limit/i);
    expect(craftCalled).toBe(0);
  });

  it("rejects empty post_ids", async () => {
    const craft: CraftDeps = { composeRewrite: async (s) => stubProposal(s.id) };
    await expect(dispatchTool(
      "propose_seo_rewrites",
      { post_ids: [] },
      fakeWpForCraft as any,
      undefined,
      craft,
    )).rejects.toThrow(/post_ids/);
  });

  it("throws when craft deps missing", async () => {
    await expect(dispatchTool(
      "propose_seo_rewrites",
      { post_ids: [1] },
      fakeWpForCraft as any,
    )).rejects.toThrow(/craft/);
  });
});
