import { Hono } from "hono";
import { mountChat } from "./routes/chat";
import { mountHealth } from "./routes/health";
import { createSessionStore } from "./lib/sessions";
import { createWpClient } from "./lib/wp-client";
import { tools } from "./lib/tools";
import { createAnthropicClient } from "./lib/anthropic-client";

export const app = new Hono();
mountHealth(app);

const wpBaseUrl = process.env.WP_BASE_URL;
if (!wpBaseUrl) {
  throw new Error("WP_BASE_URL is required (e.g. https://www.seo-friendly.org)");
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
const sessionStore = createSessionStore();

mountChat(app, {
  makeClient: (apiKey) => createAnthropicClient(apiKey),
  sessionStore,
  wp,
  tools,
});

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 8787);
  Bun.serve({ port, fetch: app.fetch });
  console.log(`backend listening on :${port}`);
}
