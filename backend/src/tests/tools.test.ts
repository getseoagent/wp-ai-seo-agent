import { describe, expect, it } from "bun:test";
import { tools, dispatchTool } from "../lib/tools";
import type { WpClient } from "../lib/wp-client";

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
    expect(names).toEqual(["detect_seo_plugin", "get_categories", "get_history", "get_post_summary", "get_tags", "list_posts", "rollback", "update_seo_fields"]);
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
