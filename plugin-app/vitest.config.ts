import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    // jsdom for hook tests that touch document/Notification/localStorage; pure
    // function tests like parseSseChunks don't need it but the cost is negligible.
    environment: "jsdom",
  },
});
