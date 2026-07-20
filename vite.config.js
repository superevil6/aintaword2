import { defineConfig } from "vite";

// Relative base so the built site can be hosted from any path — e.g. dropped
// under https://example.com/games/aintaword/ on a multi-game site without a
// rebuild. Runtime asset fetches use import.meta.env.BASE_URL to stay in sync.
export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
    outDir: "dist",
  },
});
