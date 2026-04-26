import { Hono } from "hono";
import { mountChat } from "./routes/chat";
import { mountHealth } from "./routes/health";
import { createSessionStore } from "./lib/sessions";
import { createWpClient } from "./lib/wp-client";
import { tools } from "./lib/tools";
import { createAnthropicClient } from "./lib/anthropic-client";

export const app = new Hono();
mountHealth(app);

const wp = createWpClient({
  baseUrl:      process.env.WP_BASE_URL ?? "https://www.seo-friendly.org",
  sharedSecret: process.env.SHARED_SECRET ?? "",
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
