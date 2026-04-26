import { describe, expect, it } from "bun:test";
import { tools, dispatchTool } from "../lib/tools";
import type { WpClient } from "../lib/wp-client";

const fakeWp = {
  listPosts:       async (args: any) => ({ posts: [{ id: 1, post_title: "t", slug: "s", status: "publish", modified: "x" }], next_cursor: null, total: 1 }),
  getPostSummary:  async (id: number) => id === 7 ? { id: 7, post_title: "t", slug: "s", status: "publish", modified: "x", word_count: 0, current_seo: { title: null, description: null, focus_keyword: null, og_title: null } } : null,
  getCategories:   async () => [{ id: 1, name: "n", slug: "s", count: 0 }],
  getTags:         async () => [],
  detectSeoPlugin: async () => ({ name: "rank-math" }),
} as unknown as WpClient;

describe("tools", () => {
  it("exposes the expected tool names", () => {
    const names = tools.map(t => t.name).sort();
    expect(names).toEqual(["detect_seo_plugin","get_categories","get_post_summary","get_tags","list_posts"]);
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
});
