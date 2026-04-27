import { describe, expect, it } from "bun:test";
import { runBulkJob } from "../lib/job-runner";
import type { CraftDeps, RewriteProposal } from "../lib/craft";
import { CraftError } from "../lib/craft";
import type { SseEvent } from "../lib/sse";

const stubProposal = (id: number): RewriteProposal => ({
  post_id: id, intent: "informational",
  primary_keyword: { text: "kw", volume: null, source: "llm_estimate" },
  synonym: "syn",
  title: { old: "old-title", new: "T".repeat(20), length: 20 },
  description: { old: "old-desc", new: "D".repeat(50), length: 50 },
  focus_keyword: { old: "kw", new: "kw" },
  reasoning: "r",
});

const stubSummary = (id: number) => ({
  id, post_title: `Post ${id}`, slug: `s-${id}`, status: "publish",
  modified: "2026-01-01", word_count: 100, content_preview: "c",
  current_seo: { title: null, description: null, focus_keyword: null, og_title: null },
});

function makeMockWp(overrides: Partial<any> = {}) {
  return {
    getPostSummary: async (id: number) => stubSummary(id),
    updateSeoFields: async (post_id: number, fields: any, job_id: string) => ({
      job_id, results: [
        { field: "title", status: "applied", before: "old-title", after: fields.title },
      ],
    }),
    getJob: async (id: string) => ({ id, status: "running", total: 0, done: 0, failed_count: 0, cancel_requested_at: null, started_at: "", finished_at: null, last_progress_at: null, user_id: 0, tool_name: "t", style_hints: null, params_json: null }),
    updateJobProgress: async () => ({ ok: true }),
    markJobDone: async () => ({ ok: true }),
    ...overrides,
  } as any;
}

describe("runBulkJob", () => {
  it("processes all post ids and returns summary", async () => {
    const events: SseEvent[] = [];
    const craft: CraftDeps = { composeRewrite: async (s) => stubProposal(s.id) };
    const wp = makeMockWp();
    const result = await runBulkJob({
      jobId: "jA",
      postIds: [1, 2, 3],
      styleHints: "x",
      wp, craft,
      signal: new AbortController().signal,
      emit: (ev) => events.push(ev),
    });
    expect(result.applied).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.status).toBe("completed");
    const progressEvents = events.filter(e => e.type === "bulk_progress");
    expect(progressEvents).toHaveLength(3);
    expect((progressEvents[2] as any).done).toBe(3);
  });

  it("counts post_not_found as skipped without calling craft", async () => {
    let craftCalled = 0;
    const craft: CraftDeps = { composeRewrite: async (s) => { craftCalled++; return stubProposal(s.id); } };
    const wp = makeMockWp({
      getPostSummary: async (id: number) => id === 99 ? null : stubSummary(id),
    });
    const result = await runBulkJob({
      jobId: "jB", postIds: [1, 99, 3], styleHints: "",
      wp, craft, signal: new AbortController().signal, emit: () => {},
    });
    expect(result.applied).toBe(2);
    expect(result.skipped).toBe(1);
    expect(craftCalled).toBe(2);
    const skipped = result.results.find(r => r.post_id === 99);
    expect(skipped?.status).toBe("skipped");
    expect(skipped?.reason).toBe("post_not_found");
  });

  it("counts CraftError as failed and continues", async () => {
    const craft: CraftDeps = {
      composeRewrite: async (s) => {
        if (s.id === 2) throw new CraftError("api_error", "boom");
        return stubProposal(s.id);
      },
    };
    const result = await runBulkJob({
      jobId: "jC", postIds: [1, 2, 3], styleHints: "",
      wp: makeMockWp(), craft, signal: new AbortController().signal, emit: () => {},
    });
    expect(result.applied).toBe(2);
    expect(result.failed).toBe(1);
    const failed = result.results.find(r => r.post_id === 2);
    expect(failed?.status).toBe("failed");
    expect(failed?.reason).toContain("boom");
  });

  it("stops when cancel_requested_at is set on job poll", async () => {
    let pollCount = 0;
    const wp = makeMockWp({
      getJob: async (id: string) => {
        pollCount++;
        return {
          id, status: "running", total: 0, done: 0, failed_count: 0,
          cancel_requested_at: pollCount > 2 ? "2026-04-26 12:00:00" : null,
          started_at: "", finished_at: null, last_progress_at: null,
          user_id: 0, tool_name: "t", style_hints: null, params_json: null,
        };
      },
      getPostSummary: async (id: number) => {
        await new Promise(r => setTimeout(r, 30));
        return stubSummary(id);
      },
    });
    const craft: CraftDeps = { composeRewrite: async (s) => stubProposal(s.id) };
    const result = await runBulkJob({
      jobId: "jD", postIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], styleHints: "",
      wp, craft, signal: new AbortController().signal, emit: () => {},
      pollDebounceMs: 0,
    });
    expect(result.status).toBe("cancelled");
    // Some posts processed before cancel kicked in, rest skipped
    expect(result.applied + result.skipped).toBe(10);
    expect(result.skipped).toBeGreaterThan(0);
  });

  it("aborts when outer AbortSignal fires", async () => {
    const ac = new AbortController();
    const wp = makeMockWp({
      getPostSummary: async (id: number, signal?: AbortSignal) => {
        return new Promise((resolve, reject) => {
          if (signal?.aborted) reject(new Error("aborted"));
          signal?.addEventListener("abort", () => reject(new Error("aborted")));
          setTimeout(() => resolve(stubSummary(id)), 50);
        });
      },
    });
    const craft: CraftDeps = { composeRewrite: async (s) => stubProposal(s.id) };
    setTimeout(() => ac.abort(), 25);
    const result = await runBulkJob({
      jobId: "jE", postIds: [1, 2, 3, 4, 5], styleHints: "",
      wp, craft, signal: ac.signal, emit: () => {},
    });
    expect(result.status).toBe("cancelled");
  });

  it("emits monotonic done counter in progress events", async () => {
    const events: SseEvent[] = [];
    const craft: CraftDeps = { composeRewrite: async (s) => stubProposal(s.id) };
    await runBulkJob({
      jobId: "jF", postIds: [1, 2, 3, 4, 5], styleHints: "",
      wp: makeMockWp(), craft, signal: new AbortController().signal,
      emit: (ev) => events.push(ev),
    });
    const dones = events.filter(e => e.type === "bulk_progress").map(e => (e as any).done);
    for (let i = 1; i < dones.length; i++) {
      expect(dones[i]).toBeGreaterThanOrEqual(dones[i - 1]);
    }
  });
});
