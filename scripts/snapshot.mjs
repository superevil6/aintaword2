// Renders the game's real DOM (via jsdom) into a self-contained static HTML
// file with the real stylesheets inlined, so a headless browser can screenshot
// the layout without waiting on async mounting.
//
//   node scripts/snapshot.mjs <out.html> [board|over]
//
// Layout verification only — not part of the app.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { JSDOM } from "jsdom";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");
const outFile = process.argv[2] || path.join(root, "snapshot.html");
const mode = process.argv[3] || "board";

const dom = new JSDOM(`<!DOCTYPE html><body><div id="app"></div></body>`, {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
for (const k of [
  "window",
  "document",
  "localStorage",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "HTMLElement",
]) {
  globalThis[k] = dom.window[k];
}

const { AintAWordGame } = await import("../src/games/aintaword/game.js");
const { wordsForTiers } = await import("../src/data/commonWords.js");

const valid = new Set(
  readFileSync(path.join(root, "public/data/dictionary.txt"), "utf8")
    .split("\n")
    .map((w) => w.trim())
    .filter(Boolean),
);
const sources = [...new Set(wordsForTiers())];
sources.forEach((w) => valid.add(w));
const dict = {
  isWord: (w) => valid.has(w),
  sourcePool: ({ minLen = 0, maxLen = Infinity, tiers = null } = {}) =>
    (tiers ? wordsForTiers(tiers) : sources).filter(
      (w) => w.length >= minLen && w.length <= maxLen,
    ),
};

const app = document.getElementById("app");
const game = new AintAWordGame(app, dict, { seed: "snapshot" });

if (mode === "select" || mode === "select-played") {
  if (mode === "select-played") {
    // Simulate having already played Medium today.
    game.start("medium");
    for (let i = 0; i < 14; i++) {
      game.choiceEls[i % 5 === 3 ? 1 - game.correctSide : game.correctSide].click();
    }
    game.timer.adjust(-999999);
    game._showSelect();
  }
} else {
  game.start("medium");
}

let extraCss = "";
if (mode === "penalty") {
  // Take a wrong pick, then freeze the indicator at its peak keyframe — a
  // static screenshot would otherwise catch it already faded out.
  game.choiceEls[1 - game.correctSide].click();
  game._renderClock(41_300); // a plausible mid-game clock reading
  extraCss = `
    .aaw-penalty.is-shown {
      animation: none !important;
      opacity: 1 !important;
      transform: translateY(-2px) scale(1.1) !important;
    }`;
} else if (mode === "over") {
  // Play a representative round so the review list has content.
  for (let i = 0; i < 12; i++) {
    game.choiceEls[i % 4 === 3 ? 1 - game.correctSide : game.correctSide].click();
  }
  game.timer.adjust(-999999);
} else {
  // Force specific words on to stress-test fitting. Pass a comma pair as the
  // 4th arg, e.g. `node scripts/snapshot.mjs out.html board straightforward,misundderstanding`
  const forced = (process.argv[4] || "processing,recceiving").split(",");
  game.sides[0] = forced[0];
  game.sides[1] = forced[1];
  game._renderChoices();
}

const css = [
  readFileSync(path.join(root, "src/styles/global.css"), "utf8"),
  readFileSync(path.join(root, "src/games/aintaword/aintaword.css"), "utf8"),
  extraCss,
].join("\n");

writeFileSync(
  outFile,
  `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>snapshot</title><style>${css}</style></head>
<body><div id="app">${app.innerHTML}</div></body></html>`,
);

console.log(`wrote ${outFile} (${mode})`);
