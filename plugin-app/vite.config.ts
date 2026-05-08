import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// wp.org guideline #4 — every emitted JS chunk MUST begin with a pointer to
// the public source repo so the minified bundle is never opaque to reviewers
// or users. `rollupOptions.output.banner` and `renderChunk` both lose to
// esbuild's helper preamble (`var __defProp = Object.defineProperty; ...`),
// which Vite injects AFTER those hooks fire. `generateBundle` runs once all
// chunks are fully assembled, so prepending here lands the banner at byte 0.
const SOURCE_BANNER =
  "/*! Source: https://github.com/getseoagent/wp-ai-seo-agent — built from plugin-app/src/ via Vite. See readme.txt → 'Source Code & Build Instructions'. */\n";

const sourceBanner: Plugin = {
  name: "source-banner",
  generateBundle(_options, bundle) {
    for (const file of Object.values(bundle)) {
      if (file.type === "chunk" && file.fileName.endsWith(".js")) {
        file.code = SOURCE_BANNER + file.code;
      }
    }
  },
};

export default defineConfig({
  plugins: [react(), sourceBanner],
  build: {
    manifest: true,
    outDir: resolve(__dirname, "../plugin/assets/dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "index.html"),
    },
  },
});
