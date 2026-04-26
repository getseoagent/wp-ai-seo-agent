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
    expect(events.map(e => e.type)).toEqual([
      "tool_call", "tool_result", "tool_call", "tool_result", "text", "done"
    ]);
    expect(events[0]).toMatchObject({ id: "tu_1" });
    expect(events[2]).toMatchObject({ id: "tu_2" });
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
});
