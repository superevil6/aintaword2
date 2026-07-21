// Renders Color Path's real DOM (via jsdom) into a self-contained static HTML
// file with the real stylesheets inlined, so a headless browser can screenshot
// the board without a dev server.
//
//   node scripts/snapshot-colorpath.mjs <out.html> [picker|board] [difficulty] [classic|cvd]
//
// Layout verification only — not part of the app.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { JSDOM } from "jsdom";

const dir  = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");
const outFile    = process.argv[2] || path.join(root, "snapshot-colorpath.html");
const mode       = process.argv[3] || "board";
const difficulty = process.argv[4] || "hard";

const dom = new JSDOM(`<!DOCTYPE html><body><div id="app"></div></body>`, {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
for (const k of [
  "window", "document", "localStorage",
  "requestAnimationFrame", "cancelAnimationFrame", "HTMLElement",
]) {
  globalThis[k] = dom.window[k];
}

const { ColorPathGame } = await import("../src/games/colorpath/game.js");
const { PRIMARIES, setPalette } = await import("../src/games/colorpath/colors.js");

if (process.argv[5]) setPalette(process.argv[5]);

const app = document.getElementById("app");
app.className = "app-view";
const game = new ColorPathGame(
  app,
  mode === "picker" ? { seed: "snapshot" } : { difficulty, seed: "snapshot" },
);

if (mode === "board") {
  // Walk a few moves so the snapshot shows a trail, a collected circle if one
  // falls out, and at least one primary flipped to "remove".
  for (let i = 0; i < 6; i++) {
    const bit = PRIMARIES.map((p) => p.bit).find((b) => game.grid.targetsFor(b).length > 0);
    if (bit === undefined) break;
    const [dest] = game.grid.targetsFor(bit);
    if (game.grid.isVisited(dest)) break;
    game._resolveMove(dest);
  }
}

const css = ["src/styles/global.css", "src/games/colorpath/colorpath.css"]
  .map((f) => readFileSync(path.join(root, f), "utf8"))
  .join("\n");

writeFileSync(
  outFile,
  `<!DOCTYPE html><meta charset="utf-8"><title>Color Path snapshot</title>
<style>${css}</style>
<body>${app.outerHTML}</body>`,
);
console.log(`wrote ${outFile} (${mode}${mode === "board" ? ` · ${difficulty}` : ""})`);
// The picker demo loop and the board clock both keep the event loop alive.
process.exit(0);
