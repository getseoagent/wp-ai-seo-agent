import { describe, expect, it } from "bun:test";
import { runAgent, type AgentClient } from "../lib/agent-loop";
import { tools } from "../lib/tools";
import type { WpClient } from "../lib/wp-client";
import { _resetPsiCacheForTests } from "../lib/speed/psi-client";
import { _resetPsiRateLimitForTests } from "../lib/speed/rate-limit";

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
        ...script.deltas.map(d => ({ type: "text" as const, text: d })),
        ...(script.toolCalls ?? []).map(tc => ({ type: "tool_use" as const, id: tc.id, name: tc.name, input: tc.input })),
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
    expect(errors[0].code).toBe("iteration_cap");
    expect(errors[0].message).toMatch(/too many turns/i);
  });

  it("emits error tool_result and continues when dispatchTool denies tool", async () => {
    const client = scriptedClient([
      { deltas: [], toolCalls: [{ id: "tu_1", name: "bogus", input: {} }], stop: "tool_use" },
      { deltas: ["Recovered"], stop: "end_turn" },
    ]);
    const events: any[] = [];
    for await (const ev of runAgent({ messages:[{ role: "user", content: "x" }], wp: fakeWp, signal: new AbortController().signal, client, tools })) {
      events.push(ev);
    }
    expect(events.map(e => e.type)).toEqual(["tool_call", "tool_result", "text", "done"]);
    expect((events[1] as any).result).toMatchObject({ error: expect.stringContaining("not enabled") });
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

// ---------------------------------------------------------------------------
// Task-5 concurrent fanout: both audit_url_speed calls in one turn get psiKey
// ---------------------------------------------------------------------------
describe("runAgent psiKey concurrent fan-out enrichment", () => {
  it("enriches every audit_url_speed in a concurrent fan-out turn", async () => {
    _resetPsiCacheForTests();
    _resetPsiRateLimitForTests();

    const seenKeys: string[] = [];
    const recordingFetch = async (url: string) => {
      const match = url.match(/[?&]key=([^&]+)/);
      if (match) seenKeys.push(match[1]);
      return new Response(JSON.stringify(FAKE_PSI_BODY), { status: 200 });
    };

    // The model returns TWO concurrent audit_url_speed tool uses in one turn.
    // audit_url_speed has concurrent:true, so both are dispatched via Promise.allSettled.
    // enrichSpeedArgs must inject _psi_api_key into each before dispatch.
    const client = scriptedClient([
      {
        deltas: [],
        toolCalls: [
          { id: "tu_s1", name: "audit_url_speed", input: { url: "https://example.com/a0", strategy: "mobile" as const, _fetch_impl: recordingFetch } },
          { id: "tu_s2", name: "audit_url_speed", input: { url: "https://example.com/a1", strategy: "mobile" as const, _fetch_impl: recordingFetch } },
        ],
        stop: "tool_use",
      },
      { deltas: ["Done"], stop: "end_turn" },
    ]);

    const events: any[] = [];
    for await (const ev of runAgent({
      messages: [{ role: "user", content: "audit two pages" }],
      wp: fakeWp,
      signal: new AbortController().signal,
      client,
      tools,
      tier: "pro",
      psiKey: "K-test",
      licenseKey: "AISEO-FAN-001",
    })) {
      events.push(ev);
    }

    // Both PSI fetches happened and both carried the same key
    expect(seenKeys.length).toBe(2);
    expect(seenKeys.every(k => k === "K-test")).toBe(true);

    // Both tool results succeeded (no error field)
    const speedResults = events.filter((e: any) => e.type === "tool_result" && (e.id === "tu_s1" || e.id === "tu_s2"));
    expect(speedResults.length).toBe(2);
    for (const r of speedResults) {
      expect((r as any).result?.error).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Task-5 contract: psiKey + licenseKey enrichment for audit_url_speed
// ---------------------------------------------------------------------------
const FAKE_PSI_BODY = {
  lighthouseResult: {
    finalUrl: "https://example.com/",
    categories: { performance: { score: 0.72 } },
    audits: {
      "largest-contentful-paint": { numericValue: 2100 },
      "cumulative-layout-shift":  { numericValue: 0.05 },
      "interaction-to-next-paint":{ numericValue: 180 },
      "first-contentful-paint":   { numericValue: 900 },
      "server-response-time":     { numericValue: 200 },
      "unsized-images": { id: "unsized-images", title: "x" },
      "largest-contentful-paint-element": { details: { items: [{ items: [{ url: "https://example.com/hero.jpg" }] }] } },
    },
  },
};
const okFetch = (async () => new Response(JSON.stringify(FAKE_PSI_BODY), { status: 200 })) as unknown as typeof fetch;

describe("runAgent psiKey / licenseKey enrichment", () => {
  it("injects _psi_api_key from psiKey arg into audit_url_speed dispatch (pro tier)", async () => {
    _resetPsiCacheForTests();
    _resetPsiRateLimitForTests();

    // The model requests audit_url_speed WITHOUT _psi_api_key in the input.
    // runAgent must enrich it from args.psiKey before calling dispatchTool.
    // We pass _fetch_impl so the real PSI HTTP call is skipped.
    const client = scriptedClient([
      {
        deltas: [],
        toolCalls: [{ id: "tu_speed", name: "audit_url_speed", input: { url: "https://example.com/", strategy: "mobile" as const, _fetch_impl: okFetch } }],
        stop: "tool_use",
      },
      { deltas: ["Done"], stop: "end_turn" },
    ]);

    const events: any[] = [];
    for await (const ev of runAgent({
      messages: [{ role: "user", content: "audit my site speed" }],
      wp: fakeWp,
      signal: new AbortController().signal,
      client,
      tools,
      tier: "pro",
      psiKey: "test-psi-key-abc",
      licenseKey: "AISEO-LIC-001",
    })) {
      events.push(ev);
    }

    const toolResult = events.find((e: any) => e.type === "tool_result" && e.id === "tu_speed");
    expect(toolResult).toBeDefined();
    // If _psi_api_key was NOT injected, dispatchTool returns { error: /PSI key/i }.
    // A successful enrichment yields a result with lighthouse_score.
    expect((toolResult as any).result?.error).toBeUndefined();
    expect((toolResult as any).result?.lighthouse_score).toBe(72);
  });

  it("returns PSI-key-missing error when psiKey is absent (pro tier)", async () => {
    _resetPsiCacheForTests();
    _resetPsiRateLimitForTests();

    const client = scriptedClient([
      {
        deltas: [],
        toolCalls: [{ id: "tu_speed2", name: "audit_url_speed", input: { url: "https://example.com/", strategy: "mobile" as const } }],
        stop: "tool_use",
      },
      { deltas: ["Done"], stop: "end_turn" },
    ]);

    const events: any[] = [];
    for await (const ev of runAgent({
      messages: [{ role: "user", content: "audit my site" }],
      wp: fakeWp,
      signal: new AbortController().signal,
      client,
      tools,
      tier: "pro",
      // psiKey intentionally omitted
    })) {
      events.push(ev);
    }

    const toolResult = events.find((e: any) => e.type === "tool_result" && e.id === "tu_speed2");
    expect(toolResult).toBeDefined();
    expect((toolResult as any).result?.error).toMatch(/PSI key/i);
  });
});
