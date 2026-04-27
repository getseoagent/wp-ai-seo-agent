import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { SQL } from "bun";
import { createSessionStore, type SessionStore, SessionNotFoundError } from "../lib/sessions";
import { runMigrations } from "../lib/migrations";

const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const MIG_DIR = `${import.meta.dir}/../../migrations`;

describe("createSessionStore (Postgres-backed)", () => {
  let sql: SQL;
  let store: SessionStore;

  beforeAll(async () => {
    sql = new SQL(TEST_DB_URL!);
    await sql`DROP TABLE IF EXISTS session_messages CASCADE`;
    await sql`DROP TABLE IF EXISTS sessions CASCADE`;
    await sql`DROP TABLE IF EXISTS licenses CASCADE`;
    await sql`DROP TABLE IF EXISTS migrations CASCADE`;
    await runMigrations(sql, MIG_DIR);
  });
  afterAll(async () => { await sql.close(); });
  beforeEach(async () => {
    await sql`DELETE FROM session_messages`;
    await sql`DELETE FROM sessions`;
    store = createSessionStore(sql);
  });

  it("getOrCreate returns empty array for new id and inserts the row", async () => {
    const msgs = await store.getOrCreate("s1", { siteUrl: "https://example.com", licenseKey: null });
    expect(msgs).toEqual([]);
    const rows = await sql`SELECT * FROM sessions WHERE id = ${"s1"}`;
    expect(rows.length).toBe(1);
    expect(rows[0].site_url).toBe("https://example.com");
  });

  it("appendMessage persists string content and returns it on next get", async () => {
    await store.getOrCreate("s2", { siteUrl: "https://example.com", licenseKey: null });
    await store.appendMessage("s2", { role: "user", content: "hello" });
    const msgs = await store.getMessages("s2");
    expect(msgs).toEqual([{ role: "user", content: "hello" }]);
  });

  it("appendMessage persists Array<AssistantBlock> content (tool_use shape)", async () => {
    await store.getOrCreate("s3", { siteUrl: "https://example.com", licenseKey: null });
    const blocks = [
      { type: "text", text: "ok" },
      { type: "tool_use", id: "tu_1", name: "list_posts", input: { limit: 5 } },
    ];
    await store.appendMessage("s3", { role: "assistant", content: blocks as any });
    const msgs = await store.getMessages("s3");
    expect(msgs[0].content).toEqual(blocks as any);
  });

  it("appendMessage persists tool_result block array", async () => {
    await store.getOrCreate("s4", { siteUrl: "https://example.com", licenseKey: null });
    const blocks = [{ type: "tool_result", tool_use_id: "tu_1", content: '{"posts":[]}' }];
    await store.appendMessage("s4", { role: "user", content: blocks as any });
    const msgs = await store.getMessages("s4");
    expect(msgs[0].content).toEqual(blocks as any);
  });

  it("getMessages returns ordered by seq", async () => {
    await store.getOrCreate("s5", { siteUrl: "https://example.com", licenseKey: null });
    await store.appendMessage("s5", { role: "user", content: "1" });
    await store.appendMessage("s5", { role: "assistant", content: "2" });
    await store.appendMessage("s5", { role: "user", content: "3" });
    const msgs = await store.getMessages("s5");
    expect(msgs.map(m => m.content)).toEqual(["1", "2", "3"]);
  });

  it("appendMessage updates last_active_at and message_count", async () => {
    await store.getOrCreate("s6", { siteUrl: "https://example.com", licenseKey: null });
    await store.appendMessage("s6", { role: "user", content: "x" });
    const rows = await sql`SELECT message_count, last_active_at FROM sessions WHERE id = ${"s6"}`;
    expect(rows[0].message_count).toBe(1);
  });

  it("pruneOlderThan deletes stale sessions and cascades messages", async () => {
    await store.getOrCreate("s_old", { siteUrl: "https://example.com", licenseKey: null });
    await store.appendMessage("s_old", { role: "user", content: "x" });
    // Manually backdate
    await sql`UPDATE sessions SET last_active_at = NOW() - INTERVAL '120 days' WHERE id = ${"s_old"}`;
    await store.getOrCreate("s_new", { siteUrl: "https://example.com", licenseKey: null });

    const deleted = await store.pruneOlderThan(90);
    expect(deleted).toBe(1);

    const remaining = await sql`SELECT id FROM sessions ORDER BY id`;
    expect(remaining.map((r: any) => r.id)).toEqual(["s_new"]);
    const msgs = await sql`SELECT COUNT(*)::int AS n FROM session_messages`;
    expect(msgs[0].n).toBe(0); // cascaded
  });

  it("appendMessage throws SessionNotFoundError for unknown session id", async () => {
    let caught: unknown = null;
    try {
      await store.appendMessage("nonexistent_id", { role: "user", content: "x" });
    } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(SessionNotFoundError);
  });
});
