import { describe, expect, it } from "bun:test";
import { tools, dispatchTool } from "../lib/tools";
import type { WpClient } from "../lib/wp-client";
import type { CraftDeps, RewriteProposal } from "../lib/craft";
import { CraftError } from "../lib/craft";
import type { BulkApplyResult } from "../lib/job-runner";

const fakeWp = {
  listPosts:       async (args: any) => ({ posts: [{ id: 1, post_title: "t", slug: "s", status: "publish", modified: "x" }], next_cursor: null, total: 1 }),
  getPostSummary:  async (id: number) => id === 7 ? { id: 7, post_title: "t", slug: "s", status: "publish", modified: "x", word_count: 0, current_seo: { title: null, description: null, focus_keyword: null, og_title: null } } : null,
  getCategories:   async () => [{ id: 1, name: "n", slug: "s", count: 0 }],
  getTags:         async () => [],
  detectSeoPlugin: async () => ({ name: "rank-math" }),
  updateSeoFields: async (post_id: number, fields: any, job_id?: string) => ({ job_id: job_id ?? "auto", results: [{ field: Object.keys(fields)[0], status: "applied" }] }),
  getHistory:      async (args: any) => ({ rows: [{ id: 1, post_id: args.post_id ?? 1 }], next_cursor: null, total: 1 }),
  rollback:        async (params: { history_ids?: number[]; job_id?: string }) => ({ job_id: "rj", results: (params.history_ids ?? []).map(id => ({ history_id: id, status: "rolled_back" })) }),
} as unknown as WpClient;

describe("tools", () => {
  it("exposes the new write tool names", () => {
    const names = tools.map(t => t.name).sort();
    expect(names).toEqual(["apply_style_to_batch", "cancel_job", "detect_seo_plugin", "get_categories", "get_history", "get_job_status", "get_post_summary", "get_tags", "list_posts", "propose_seo_rewrites", "rollback", "update_seo_fields"]);
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

  it("denies unknown tool via tier gate (fail-closed)", async () => {
    const out: any = await dispatchTool("bogus", {}, fakeWp);
    expect(out.error).toMatch(/not enabled/);
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
        if (s.id === 2) throw new CraftError("api_error", "boom");
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

const fakeWpForBulk = {
  ...fakeWp,
  getPostSummary: async (id: number) => id === 99 ? null : ({
    id, post_title: `t${id}`, slug: `s${id}`, status: "publish", modified: "x",
    word_count: 0, content_preview: "c",
    current_seo: { title: null, description: null, focus_keyword: null, og_title: null },
  }),
  updateSeoFields: async (post_id: number, fields: any, job_id: string) => ({
    job_id, results: [{ field: "title", status: "applied", before: "old", after: fields.title }],
  }),
  createJob: async (args: any) => ({ id: args.id ?? "auto-job", ...args, status: "running", done: 0, failed_count: 0, started_at: "", finished_at: null, cancel_requested_at: null, last_progress_at: null }),
  getJob: async (id: string) => ({ id, status: "running", total: 0, done: 0, failed_count: 0, cancel_requested_at: null, started_at: "", finished_at: null, last_progress_at: null, user_id: 0, tool_name: "t", style_hints: null, params_json: null }),
  updateJobProgress: async () => ({ ok: true }),
  markJobDone: async () => ({ ok: true }),
  findRunningJobForUser: async () => null,
};

describe("apply_style_to_batch tool", () => {
  it("is registered in tools array", () => {
    expect(tools.some(t => t.name === "apply_style_to_batch")).toBe(true);
  });

  it("creates a job and runs JobRunner in the background", async () => {
    // Plan 4-B: dispatchTool returns {status:'running'} immediately and JobRunner
    // executes detached. Verify the background work via emit() event count instead
    // of synchronous return shape.
    let updateCallCount = 0;
    const events: any[] = [];
    const wp = {
      ...fakeWpForBulk,
      updateSeoFields: async (post_id: number, fields: any, job_id: string) => {
        updateCallCount++;
        return { job_id, results: [{ field: "title", status: "applied", before: "old", after: fields.title }] };
      },
    };
    const craft: CraftDeps = { composeRewrite: async (s) => ({
      post_id: s.id, intent: "informational",
      primary_keyword: { text: "k", volume: null, source: "llm_estimate" },
      synonym: "syn",
      title: { old: null, new: "T".repeat(20), length: 20 },
      description: { old: null, new: "D".repeat(50), length: 50 },
      focus_keyword: { old: null, new: "k" },
      reasoning: "r",
    }) };
    const out: any = await dispatchTool(
      "apply_style_to_batch",
      { post_ids: [1, 2, 3], style_hints: "x" },
      wp as any,
      undefined,
      craft,
      (ev) => events.push(ev),
    );
    // Immediate return shape:
    expect(out.status).toBe("running");
    expect(out.total).toBe(3);
    expect(out.job_id).toMatch(/^[0-9a-f-]{36}$/);

    // Wait for the background JobRunner to drain.
    await new Promise(r => setTimeout(r, 100));
    expect(updateCallCount).toBe(3);
    expect(events.some(e => e.type === "bulk_progress")).toBe(true);
  });

  it("rejects empty post_ids", async () => {
    const out: any = await dispatchTool(
      "apply_style_to_batch",
      { post_ids: [] },
      fakeWpForBulk as any,
      undefined,
      { composeRewrite: async () => ({} as any) },
      () => {},
    );
    expect(out.error).toMatch(/post_ids/i);
  });

  it("rejects > 200 post_ids", async () => {
    const ids = Array.from({ length: 201 }, (_, i) => i + 1);
    const out: any = await dispatchTool(
      "apply_style_to_batch",
      { post_ids: ids },
      fakeWpForBulk as any,
      undefined,
      { composeRewrite: async () => ({} as any) },
      () => {},
    );
    expect(out.error).toMatch(/200/);
  });

  it("rejects when user has running job", async () => {
    const wp = { ...fakeWpForBulk, findRunningJobForUser: async () => ({ id: "existing-job", status: "running" } as any) };
    const out: any = await dispatchTool(
      "apply_style_to_batch",
      { post_ids: [1] },
      wp as any, undefined,
      { composeRewrite: async () => ({} as any) },
      () => {},
    );
    expect(out.error).toMatch(/already running/i);
    expect(out.error).toContain("existing-job");
  });

  it("throws when craft missing", async () => {
    await expect(dispatchTool(
      "apply_style_to_batch",
      { post_ids: [1] },
      fakeWpForBulk as any,
    )).rejects.toThrow(/craft/);
  });

  it("truncates style_hints > 2048 chars", async () => {
    const craft: CraftDeps = {
      composeRewrite: async () => ({ post_id: 1, intent: "informational", primary_keyword: { text: "k", volume: null, source: "llm_estimate" }, synonym: "s", title: { old: null, new: "T", length: 1 }, description: { old: null, new: "D", length: 1 }, focus_keyword: { old: null, new: "k" }, reasoning: "r" } as any),
    };
    const out: any = await dispatchTool(
      "apply_style_to_batch",
      { post_ids: [1], style_hints: "X".repeat(3000) },
      fakeWpForBulk as any, undefined, craft, () => {},
    );
    // Plan 4-B: dispatchTool returns {style_hints} in the immediate response —
    // assert truncation there rather than waiting on the background JobRunner.
    expect(out.style_hints.length).toBeLessThanOrEqual(2048);
  });

  it("calls createJob with correct payload", async () => {
    let createArgs: any = null;
    const wp = {
      ...fakeWpForBulk,
      createJob: async (a: any) => {
        createArgs = a;
        return { id: a.id, ...a, status: "running", done: 0, failed_count: 0, started_at: "", finished_at: null, cancel_requested_at: null, last_progress_at: null } as any;
      },
    };
    const craft: CraftDeps = {
      composeRewrite: async (s) => ({
        post_id: s.id, intent: "informational",
        primary_keyword: { text: "k", volume: null, source: "llm_estimate" },
        synonym: "syn",
        title: { old: null, new: "T".repeat(20), length: 20 },
        description: { old: null, new: "D".repeat(50), length: 50 },
        focus_keyword: { old: null, new: "k" },
        reasoning: "r",
      }),
    };
    await dispatchTool(
      "apply_style_to_batch",
      { post_ids: [1, 2], style_hints: "hint-x" },
      wp as any,
      undefined,
      craft,
      () => {},
    );
    expect(createArgs).not.toBeNull();
    expect(createArgs.tool_name).toBe("apply_style_to_batch");
    expect(createArgs.total).toBe(2);
    expect(createArgs.style_hints).toBe("hint-x");
    expect(JSON.parse(createArgs.params_json)).toEqual({ post_ids: [1, 2] });
    expect(createArgs.user_id).toBe(0);
    expect(typeof createArgs.id).toBe("string");
    expect(createArgs.id.length).toBeGreaterThan(0);
  });
});

describe("cancel_job tool", () => {
  it("is registered", () => {
    expect(tools.some(t => t.name === "cancel_job")).toBe(true);
  });
  it("calls wp.cancelJob", async () => {
    const captured: { id: string | null } = { id: null };
    const wp = { ...fakeWp, cancelJob: async (id: string) => { captured.id = id; } };
    const out: any = await dispatchTool("cancel_job", { job_id: "jX" }, wp as any);
    expect(captured.id).toBe("jX");
    expect(out.status).toBe("cancel_requested");
  });
  it("is idempotent across calls (dispatch always calls wp.cancelJob)", async () => {
    const calls: string[] = [];
    const wp = { ...fakeWp, cancelJob: async (id: string) => { calls.push(id); } };
    await dispatchTool("cancel_job", { job_id: "jX" }, wp as any);
    await dispatchTool("cancel_job", { job_id: "jX" }, wp as any);
    expect(calls).toEqual(["jX", "jX"]);
  });
});

describe("get_job_status tool", () => {
  it("is registered", () => {
    expect(tools.some(t => t.name === "get_job_status")).toBe(true);
  });
  it("returns wp.getJob result", async () => {
    const wp = { ...fakeWp, getJob: async (id: string) => ({
      id, user_id: 0, tool_name: "t", status: "running", total: 5, done: 2,
      failed_count: 0, style_hints: null, params_json: null,
      started_at: "2026-04-26 12:00:00", finished_at: null,
      cancel_requested_at: null, last_progress_at: "2026-04-26 12:00:30",
    }) };
    const out: any = await dispatchTool("get_job_status", { job_id: "jY" }, wp as any);
    expect(out.job_id).toBe("jY");
    expect(out.status).toBe("running");
    expect(out.done).toBe(2);
    expect(out.total).toBe(5);
  });
  it("returns error when job not found", async () => {
    const wp = { ...fakeWp, getJob: async () => null };
    const out: any = await dispatchTool("get_job_status", { job_id: "missing" }, wp as any);
    expect(out.error).toMatch(/not found/i);
  });
});

describe("rollback tool — job_id extension", () => {
  it("accepts job_id and returns rollback summary", async () => {
    let calledWith: any = null;
    const wp = { ...fakeWp, rollback: async (params: any) => {
      calledWith = params;
      return { job_id: "rb-1", results: [{ history_id: 1, status: "rolled_back" }, { history_id: 2, status: "rolled_back" }] };
    } };
    const out: any = await dispatchTool("rollback", { job_id: "jZ" }, wp as any);
    expect(calledWith).toEqual({ job_id: "jZ" });
    expect(out.results).toHaveLength(2);
  });
  it("history_ids path still works", async () => {
    let calledWith: any = null;
    const wp = { ...fakeWp, rollback: async (params: any) => {
      calledWith = params;
      return { job_id: "rb-2", results: [{ history_id: 5, status: "rolled_back" }] };
    } };
    await dispatchTool("rollback", { history_ids: [5] }, wp as any);
    expect(calledWith).toEqual({ history_ids: [5] });
  });
  it("rejects when neither provided", async () => {
    const out: any = await dispatchTool("rollback", {}, fakeWp as any);
    expect(out.error).toMatch(/history_ids or job_id/i);
  });
  it("rejects when both history_ids and job_id provided", async () => {
    const out: any = await dispatchTool("rollback", { history_ids: [1], job_id: "j" }, fakeWp as any);
    expect(out.error).toMatch(/only one of/i);
  });
});

describe("tier gate at dispatchTool", () => {
  it("free-tier user is denied update_seo_fields with friendly error", async () => {
    const out: any = await dispatchTool(
      "update_seo_fields",
      { post_id: 1, fields: { title: "X" } },
      fakeWp, undefined, undefined, undefined,
      "free",
    );
    expect(out.error).toMatch(/Pro/i);
    expect(out.upgrade_url).toBe("https://www.seo-friendly.org/pricing");
  });

  it("pro-tier user can update_seo_fields", async () => {
    const out: any = await dispatchTool(
      "update_seo_fields",
      { post_id: 1, fields: { title: "X" } },
      fakeWp, undefined, undefined, undefined,
      "pro",
    );
    expect(out.error).toBeUndefined();
  });

  it("apply_style_to_batch with 50 ids on Pro is rejected with Agency tier message", async () => {
    const out: any = await dispatchTool(
      "apply_style_to_batch",
      { post_ids: Array(50).fill(1), style_hints: "" },
      fakeWp, undefined, { composeRewrite: async () => ({} as any) }, undefined,
      "pro",
    );
    expect(out.error).toMatch(/Agency/i);
  });
});

describe("apply_style_to_batch detachment", () => {
  const minimalProposal = {
    post_id: 1, intent: "rewrite", confidence: 0.9, reasoning: "r",
    title: { current: "c", new: "n", diff_summary: "" },
    description: { current: "c", new: "n", diff_summary: "" },
    focus_keyword: { current: "c", new: "n", diff_summary: "" },
  } as unknown as RewriteProposal;

  it("returns {status:'running'} immediately without awaiting bulk job completion", async () => {
    let getPostSummaryHang = true;
    const wp = {
      ...fakeWp,
      findRunningJobForUser: async () => null,
      createJob: async () => undefined,
      getPostSummary: async (id: number) => {
        // Hang to prove dispatchTool doesn't wait for runBulkJob to complete.
        while (getPostSummaryHang) await new Promise(r => setTimeout(r, 10));
        return { id, post_title: "T", slug: "s", status: "publish", modified: "x", word_count: 0, current_seo: { title: null, description: null, focus_keyword: null, og_title: null } };
      },
      getJob: async () => ({ status: "running", cancel_requested_at: null, done: 0, failed_count: 0 }),
      updateJobProgress: async () => undefined,
      updateSeoFields: async () => ({ job_id: "j", results: [] }),
      markJobDone: async () => undefined,
    } as any;
    const fakeCraft: CraftDeps = { composeRewrite: async () => minimalProposal };

    const t0 = Date.now();
    const result: any = await dispatchTool(
      "apply_style_to_batch",
      { post_ids: [1, 2, 3], style_hints: "" },
      wp,
      new AbortController().signal,
      fakeCraft,
      () => {},
    );
    const elapsed = Date.now() - t0;

    expect(elapsed).toBeLessThan(50); // fire-and-forget, not blocked by hung getPostSummary
    expect(result.status).toBe("running");
    expect(result.total).toBe(3);
    expect(result.job_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof result.started_at).toBe("string");

    // Cleanup: unblock the hung promise so the background bulk job can complete.
    getPostSummaryHang = false;
    // Give it a moment to settle so we don't leak unhandled rejections.
    await new Promise(r => setTimeout(r, 50));
  });

  it("survives parent signal abort — bulk job processes posts despite client disconnect", async () => {
    let postsTouched = 0;
    const wp = {
      ...fakeWp,
      findRunningJobForUser: async () => null,
      createJob: async () => undefined,
      getPostSummary: async (id: number) => {
        postsTouched++;
        await new Promise(r => setTimeout(r, 30));
        return { id, post_title: "T", slug: "s", status: "publish", modified: "x", word_count: 0, current_seo: { title: null, description: null, focus_keyword: null, og_title: null } };
      },
      getJob: async () => ({ status: "running", cancel_requested_at: null, done: 0, failed_count: 0 }),
      updateJobProgress: async () => undefined,
      updateSeoFields: async () => ({ job_id: "j", results: [] }),
      markJobDone: async () => undefined,
    } as any;
    const fakeCraft: CraftDeps = { composeRewrite: async () => minimalProposal };

    const parentAc = new AbortController();
    const result: any = await dispatchTool(
      "apply_style_to_batch",
      { post_ids: [1, 2], style_hints: "" },
      wp, parentAc.signal, fakeCraft, () => {},
    );
    expect(result.status).toBe("running");

    // Abort the chat-request signal AFTER the tool returned. The bulk job should
    // continue because it owns its own AbortController.
    parentAc.abort();

    // Give the worker pool time to process both posts (concurrency 3, ~30ms each + slack).
    await new Promise(r => setTimeout(r, 200));
    expect(postsTouched).toBe(2);
  });
});
