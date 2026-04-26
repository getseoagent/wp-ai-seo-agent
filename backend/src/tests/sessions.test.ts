import { describe, expect, it, beforeEach } from "bun:test";
import { createSessionStore, type Message } from "../lib/sessions";

describe("session store", () => {
  let store: ReturnType<typeof createSessionStore>;
  beforeEach(() => { store = createSessionStore({ maxSessions: 3, now: () => 1000 }); });

  it("returns empty array for unknown session", () => {
    expect(store.get("missing")).toEqual([]);
  });

  it("appends and reads back messages", () => {
    const msg: Message = { role: "user", content: "hi" };
    store.append("s1", msg);
    expect(store.get("s1")).toEqual([msg]);
  });

  it("evicts oldest when over maxSessions", () => {
    store = createSessionStore({ maxSessions: 2, now: () => 1000 });
    store.append("a", { role: "user", content: "1" });
    store.append("b", { role: "user", content: "2" });
    store.append("c", { role: "user", content: "3" });
    expect(store.get("a")).toEqual([]);
    expect(store.get("b").length).toBe(1);
    expect(store.get("c").length).toBe(1);
  });
});
