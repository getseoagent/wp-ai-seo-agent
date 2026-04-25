import { Hono } from "hono";
import { health } from "./routes/health";
import { mountChat } from "./routes/chat";
import { anthropicStream } from "./lib/anthropic";

export const app = new Hono();

app.route("/", health);
mountChat(app, anthropicStream);

const port = Number(process.env.PORT ?? 8787);

if (import.meta.main) {
  console.log(`backend listening on :${port}`);
  Bun.serve({ port, fetch: app.fetch });
}
