import { describe, expect, it } from "bun:test";
import { runAgent, type AgentClient } from "../lib/agent-loop";
import { tools } from "../lib/tools";
import type { WpClient } from "../lib/wp-client";

const fakeWp = {
  listPosts:       async () => ({ posts: [{ id: 1, post_title: "t", slug: "s", status: "publish", modified: "x" }], next_cursor: null, total: 1 }),
  getPostSummary:  async () => null,
  getCategories:   async () => [],
  getTags:         async () => [],
  detectSeoPlugin: async () => ({ name: "rank-math" }),
} as unknown as WpClient;

function scriptedClient(scripts: Array<{ deltas: string[]; toolCalls?: Array<{ id: string; name: string; input: any }>; stop: "tool_use"|"end_turn" }>): AgentClient {
  let i = 0;
  return {
    stream() {
      const script = scripts[i++];
      const blocks = [
        ...script.deltas.map(d => ({ type: "text", text: d })),
        ...(script.toolCalls ?? []).map(tc => ({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input })),
      ];
      const final = { content: blocks, stop_reason: script.stop };
      const chunks = script.deltas.map(d => ({ type: "text", delta: d } as const));
      return {
        async *[Symbol.asyncIterator]() {
          for (const c of chunks) yield c;
        },
        async finalMessage() { return final; },
      };
    },
  };
}

describe("runAgent", () => {
  it("yields text and done on a single end_turn turn", async () => {
    const client = scriptedClient([{ deltas: ["Hi", "!"], stop: "end_turn" }]);
    const events: any[] = [];
    for await (const ev of runAgent({ messages:[{ role: "user", content: "hello" }], wp: fakeWp, signal: new AbortController().signal, client, tools })) {
      events.push(ev);
    }
    expect(events.map(e => e.type)).toEqual(["text", "text", "done"]);
    expect(events[0].delta).toBe("Hi");
  });

  it("loops on tool_use, yields tool_call/tool_result, then completes", async () => {
    const client = scriptedClient([
      { deltas: ["Looking…"], toolCalls: [{ id: "tu_1", name: "list_posts", input: { limit: 1 } }], stop: "tool_use" },
      { deltas: ["Found 1 post."], stop: "end_turn" },
    ]);
    const events: any[] = [];
    for await (const ev of runAgent({ messages:[{ role: "user", content: "list my posts" }], wp: fakeWp, signal: new AbortController().signal, client, tools })) {
      events.push(ev);
    }
    expect(events.map(e => e.type)).toEqual(["text", "tool_call", "tool_result", "text", "done"]);
    expect(events[1]).toMatchObject({ type: "tool_call", id: "tu_1", name: "list_posts" });
    expect(events[2]).toMatchObject({ type: "tool_result", id: "tu_1" });
  });

  it("emits error event when aborted", async () => {
    const ac = new AbortController();
    const client = scriptedClient([{ deltas: ["A"], stop: "tool_use", toolCalls: [{ id: "tu_1", name: "list_posts", input: {} }] }]);
    ac.abort();
    const events: any[] = [];
    for await (const ev of runAgent({ messages:[{ role: "user", content: "x" }], wp: fakeWp, signal: ac.signal, client, tools })) {
      events.push(ev);
    }
    expect(events.find(e => e.type === "error")).toBeDefined();
  });

  it("caps iterations to prevent infinite tool loops", async () => {
    const tool: any = { id: "t", name: "list_posts", input: {} };
    const scripts = Array.from({ length: 20 }, () => ({ deltas: [], toolCalls: [tool], stop: "tool_use" as const }));
    const client = scriptedClient(scripts);
    const events: any[] = [];
    for await (const ev of runAgent({ messages:[{ role: "user", content: "x" }], wp: fakeWp, signal: new AbortController().signal, client, tools, maxIterations: 3 })) {
      events.push(ev);
    }
    const errors = events.filter(e => e.type === "error");
    expect(errors.length).toBe(1);
    expect(errors[0].message).toMatch(/iteration cap/i);
  });

  it("emits error tool_result and continues when dispatchTool throws", async () => {
    const client = scriptedClient([
      { deltas: [], toolCalls: [{ id: "tu_1", name: "bogus", input: {} }], stop: "tool_use" },
      { deltas: ["Recovered"], stop: "end_turn" },
    ]);
    const events: any[] = [];
    for await (const ev of runAgent({ messages:[{ role: "user", content: "x" }], wp: fakeWp, signal: new AbortController().signal, client, tools })) {
      events.push(ev);
    }
    expect(events.map(e => e.type)).toEqual(["tool_call", "tool_result", "text", "done"]);
    expect((events[1] as any).result).toMatchObject({ error: expect.stringContaining("unknown tool") });
  });

  it("groups multiple tool_uses in one iteration into a single user follow-up", async () => {
    const client = scriptedClient([
      { deltas: [], toolCalls: [
        { id: "tu_1", name: "list_posts", input: { limit: 1 } },
        { id: "tu_2", name: "get_categories", input: {} },
      ], stop: "tool_use" },
      { deltas: ["Done"], stop: "end_turn" },
    ]);
    const events: any[] = [];
    for await (const ev of runAgent({ messages:[{ role: "user", content: "x" }], wp: fakeWp, signal: new AbortController().signal, client, tools })) {
      events.push(ev);
    }
    // Plan 4-B contract: all tool_call events emit upfront in input order,
    // then tool_results follow in resolve order. Frontend matches by id, so
    // this re-ordering is invisible to the UI.
    expect(events.map(e => e.type)).toEqual([
      "tool_call", "tool_call", "tool_result", "tool_result", "text", "done"
    ]);
    expect(events[0]).toMatchObject({ id: "tu_1" });
    expect(events[1]).toMatchObject({ id: "tu_2" });
  });

  it("propagates craft deps through to dispatchTool", async () => {
    // propose_seo_rewrites requires CraftDeps. Without it, dispatchTool throws
    // "craft deps required". With it threaded through, fakeCraft.composeRewrite is called.
    let composeRewriteCalls = 0;
    const fakeCraft = {
      composeRewrite: async (_summary: any, _hints: any, _signal?: AbortSignal) => {
        composeRewriteCalls++;
        return {
          post_id: 7,
          intent: "informational" as const,
          primary_keyword: { text: "kw", volume: null, source: "llm_estimate" as const },
          synonym: "kw2",
          title:         { old: null, new: "New Title", length: 9 },
          description:   { old: null, new: "New Desc",  length: 8 },
          focus_keyword: { old: null, new: "kw" },
          reasoning: "because",
        };
      },
    };
    const wpWithSummary = {
      ...fakeWp,
      getPostSummary: async () => ({
        id: 7, post_title: "t", slug: "s", status: "publish", modified: "x",
        seo_title: null, seo_description: null, seo_focus_keyword: null,
        categories: [], tags: [], content_preview: "preview",
      } as any),
    } as unknown as WpClient;
    const client = scriptedClient([
      { deltas: [], toolCalls: [{ id: "tu_1", name: "propose_seo_rewrites", input: { post_ids: [7] } }], stop: "tool_use" },
      { deltas: ["Done"], stop: "end_turn" },
    ]);
    const events: any[] = [];
    for await (const ev of runAgent({
      messages: [{ role: "user", content: "x" }],
      wp: wpWithSummary,
      signal: new AbortController().signal,
      client,
      tools,
      craft: fakeCraft,
    })) {
      events.push(ev);
    }
    expect(composeRewriteCalls).toBe(1);
    const toolResult = events.find(e => e.type === "tool_result") as any;
    expect(toolResult).toBeDefined();
    expect(toolResult.result?.proposals?.length).toBe(1);
    expect(toolResult.result?.failures?.length).toBe(0);
  });

  it("emits error and returns when stream throws non-abort error", async () => {
    const throwingClient: AgentClient = {
      stream() {
        return {
          async *[Symbol.asyncIterator]() {
            throw new Error("network blew up");
          },
          async finalMessage() { throw new Error("should not be called"); },
        };
      },
    };
    const events: any[] = [];
    for await (const ev of runAgent({ messages:[{ role: "user", content: "x" }], wp: fakeWp, signal: new AbortController().signal, client: throwingClient, tools })) {
      events.push(ev);
    }
    expect(events.length).toBe(1);
    expect(events[0]).toMatchObject({ type: "error", message: "network blew up" });
  });

  it("RunAgentArgs.emit is optional", () => {
    const args: import("../lib/agent-loop").RunAgentArgs = {
      messages: [], wp: {} as any, signal: new AbortController().signal,
      client: {} as any, tools: [],
      // no emit, no craft
    };
    expect(args).toBeDefined();
  });
});

describe("runAgent split-dispatch", () => {
  it("dispatches concurrent tools in parallel (total time < sum)", async () => {
    const dispatchStarts: Array<{ name: string; t: number }> = [];
    const slowWp = {
      listPosts:      async () => { dispatchStarts.push({ name: "list_posts", t: Date.now() }); await new Promise(r => setTimeout(r, 80)); return { posts: [], next_cursor: null, total: 0 }; },
      getPostSummary: async () => { dispatchStarts.push({ name: "get_post_summary", t: Date.now() }); await new Promise(r => setTimeout(r, 80)); return null; },
      getCategories:  async () => [],
      getTags:        async () => [],
      detectSeoPlugin: async () => ({ name: "rank-math" }),
    } as unknown as WpClient;

    const client = scriptedClient([
      { deltas: ["go"], toolCalls: [
          { id: "1", name: "list_posts", input: {} },
          { id: "2", name: "get_post_summary", input: { id: 5 } },
        ], stop: "tool_use" },
      { deltas: ["done"], stop: "end_turn" },
    ]);

    const t0 = Date.now();
    for await (const _ of runAgent({ messages: [{ role: "user", content: "hi" }], wp: slowWp, signal: new AbortController().signal, client, tools })) { void _; }
    const elapsed = Date.now() - t0;

    expect(elapsed).toBeLessThan(150); // each is 80ms; sequential would be ≥160ms
    expect(dispatchStarts.length).toBe(2);
    // Both starts within ~20ms of each other = parallel
    const startGap = Math.abs(dispatchStarts[0].t - dispatchStarts[1].t);
    expect(startGap).toBeLessThan(20);
  });

  it("dispatches sequential tools serially (one starts after the previous ends)", async () => {
    const events: Array<{ name: string; phase: "start"|"end"; t: number }> = [];
    const slowWp = {
      listPosts: async () => ({ posts: [], next_cursor: null, total: 0 }),
      getPostSummary: async () => null,
      getCategories: async () => [], getTags: async () => [], detectSeoPlugin: async () => ({ name: "rank-math" }),
      updateSeoFields: async (postId: number) => {
        events.push({ name: `update-${postId}`, phase: "start", t: Date.now() });
        await new Promise(r => setTimeout(r, 40));
        events.push({ name: `update-${postId}`, phase: "end", t: Date.now() });
        return { history_id: postId, applied: 1 };
      },
    } as unknown as WpClient;

    const client = scriptedClient([
      { deltas: ["go"], toolCalls: [
          { id: "1", name: "update_seo_fields", input: { post_id: 1, fields: { description: "x" } } },
          { id: "2", name: "update_seo_fields", input: { post_id: 2, fields: { description: "y" } } },
        ], stop: "tool_use" },
      { deltas: ["ok"], stop: "end_turn" },
    ]);

    for await (const _ of runAgent({ messages: [{ role:"user", content:"hi" }], wp: slowWp, signal: new AbortController().signal, client, tools })) { void _; }

    // First call ends before second call starts
    const firstEnd = events.find(e => e.phase === "end")!.t;
    const secondStart = events.filter(e => e.phase === "start")[1].t;
    expect(secondStart).toBeGreaterThanOrEqual(firstEnd);
  });

  it("preserves tool_call SSE event order matching input toolUses order", async () => {
    const fastWp = {
      listPosts: async () => ({ posts: [], next_cursor: null, total: 0 }),
      getPostSummary: async () => null,
      getCategories: async () => [], getTags: async () => [], detectSeoPlugin: async () => ({ name: "rank-math" }),
    } as unknown as WpClient;
    const client = scriptedClient([
      { deltas: ["go"], toolCalls: [
          { id: "first",  name: "list_posts",       input: {} },
          { id: "second", name: "get_post_summary", input: { id: 1 } },
        ], stop: "tool_use" },
      { deltas: ["ok"], stop: "end_turn" },
    ]);
    const callIds: string[] = [];
    for await (const ev of runAgent({ messages:[{role:"user",content:"hi"}], wp: fastWp, signal: new AbortController().signal, client, tools })) {
      if (ev.type === "tool_call") callIds.push(ev.id);
    }
    expect(callIds).toEqual(["first", "second"]);
  });
});
