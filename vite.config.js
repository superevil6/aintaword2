import { defineConfig } from "vite";

import { sharePages } from "./scripts/share-pages.js";
import { SITE_URL } from "./src/config.js";

// Relative base so the built site can be hosted from any path — e.g. dropped
// under https://example.com/games/aintaword/ on a multi-game site without a
// rebuild. Runtime asset fetches use import.meta.env.BASE_URL to stay in sync.
export default defineConfig({
  base: "./",
  // Emits a link-preview page per game (g/<id>/index.html) so a shared
  // per-game link unfurls with that game's title and blurb, not the site's.
  plugins: [sharePages({ siteUrl: SITE_URL })],
  build: {
    target: "es2020",
    outDir: "dist",
  },
});
