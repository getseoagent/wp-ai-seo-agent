import type { SQL } from "bun";
import type { Message } from "./agent-loop";

export type SessionMeta = {
  siteUrl: string;
  licenseKey: string | null;
};

export type SessionStore = {
  getOrCreate(id: string, meta: SessionMeta): Promise<Message[]>;
  getMessages(id: string): Promise<Message[]>;
  appendMessage(id: string, message: Message): Promise<void>;
  pruneOlderThan(days: number): Promise<number>;
};

export class SessionNotFoundError extends Error {
  constructor(id: string) {
    super(`session ${id} not found — call getOrCreate first`);
    this.name = "SessionNotFoundError";
  }
}

/**
 * Postgres-backed session store. Replaces in-memory Map<id, Message[]>.
 * JSONB on session_messages.content lets us persist full Anthropic message
 * shapes including tool_use / tool_result blocks (Plan 2 deferred item).
 *
 * Multi-instance safe: any backend node can read any session row.
 */
export function createSessionStore(sql: SQL): SessionStore {
  const store: SessionStore = {
    async getOrCreate(id, meta) {
      await sql`
        INSERT INTO sessions (id, license_key, site_url)
        VALUES (${id}, ${meta.licenseKey}, ${meta.siteUrl})
        ON CONFLICT (id) DO NOTHING
      `;
      return await store.getMessages(id);
    },

    async getMessages(id) {
      const rows = await sql`
        SELECT role, content FROM session_messages
        WHERE session_id = ${id}
        ORDER BY seq ASC
      ` as Array<{ role: string; content: unknown }>;
      // Cast each row to Message — the discriminated union resists piecewise
      // typing, but the DB invariant (role+content always co-stored) holds.
      return rows.map(r => ({ role: r.role, content: r.content }) as Message);
    },

    async appendMessage(id, message) {
      // Atomically: read seq, insert, update parent. FOR UPDATE locks the
      // row so concurrent appends to the same session don't race on seq.
      await sql.begin(async (tx: SQL) => {
        const seqRow = await tx`SELECT message_count AS seq FROM sessions WHERE id = ${id} FOR UPDATE` as Array<{ seq: number }>;
        if (seqRow.length === 0) throw new SessionNotFoundError(id);
        const nextSeq = seqRow[0].seq;
        // Bun.SQL serializes JS values natively into JSONB when passed as
        // template params (no ::jsonb cast needed). Strings round-trip as
        // JSONB strings, arrays/objects as JSONB structures. Verified in 1.3.13.
        await tx`
          INSERT INTO session_messages (session_id, seq, role, content)
          VALUES (${id}, ${nextSeq}, ${message.role}, ${message.content})
        `;
        await tx`
          UPDATE sessions SET message_count = message_count + 1, last_active_at = NOW()
          WHERE id = ${id}
        `;
      });
    },

    async pruneOlderThan(days) {
      const rows = await sql`
        DELETE FROM sessions
        WHERE last_active_at < NOW() - (${days}::int * INTERVAL '1 day')
        RETURNING id
      ` as Array<{ id: string }>;
      return rows.length;
    },
  };
  return store;
}
