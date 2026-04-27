// backend/src/lib/db.ts
import { SQL } from "bun";

let _sql: SQL | null = null;

export function getDb(): SQL {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  _sql = new SQL(url);
  return _sql;
}

// For tests — explicit close so the process exits cleanly.
export async function closeDb(): Promise<void> {
  if (_sql) {
    await _sql.close();
    _sql = null;
  }
}
