import { Hono } from "hono";
import { mountChat } from "./routes/chat";
import { mountHealth } from "./routes/health";
import { createSessionStore } from "./lib/sessions";
import { createWpClient } from "./lib/wp-client";
import { tools } from "./lib/tools";
import { createAnthropicClient } from "./lib/anthropic-client";
import { runMigrations } from "./lib/migrations";
import { getDb } from "./lib/db";

export const app = new Hono();
mountHealth(app);

const wpBaseUrl = process.env.WP_BASE_URL;
if (!wpBaseUrl) {
  throw new Error("WP_BASE_URL is required (e.g. https://www.seo-friendly.org)");
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required (e.g. postgres://seoagent:***@127.0.0.1:5432/seoagent)");
}
const writeSecret = process.env.WRITE_SECRET;
if (!writeSecret) {
  throw new Error("WRITE_SECRET is required (must match SEO_AGENT_WRITE_SECRET in wp-config.php)");
}
const wp = createWpClient({
  baseUrl:      wpBaseUrl,
  sharedSecret: process.env.SHARED_SECRET ?? "",
  writeSecret,
});
const sessionStore = createSessionStore(getDb());

mountChat(app, {
  makeClient: (apiKey) => createAnthropicClient(apiKey),
  sessionStore,
  wp,
  tools,
});

if (import.meta.main) {
  // Apply any pending migrations before serving traffic.
  await runMigrations(getDb(), `${import.meta.dir}/../migrations`);

  const port = Number(process.env.PORT ?? 8787);
  Bun.serve({ port, fetch: app.fetch, idleTimeout: 255 });
  console.log(`backend listening on :${port}`);

  // One-shot sweep on startup: any 'running' job with stale last_progress_at
  // is from a previous backend process and will never resume. Mark them
  // 'interrupted' so the polling UI shows a clean terminal state instead of
  // perpetual "running". Best-effort — log and move on if WP isn't reachable.
  wp.sweepInterruptedJobs(5)
    .then(r => { if (r.interrupted > 0) console.log(`startup sweep: marked ${r.interrupted} stale running job(s) as interrupted`); })
    .catch(err => console.error("startup sweep failed:", err instanceof Error ? err.message : String(err)));
}
