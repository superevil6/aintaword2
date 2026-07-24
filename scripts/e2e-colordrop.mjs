// Headless end-to-end test of the colordrop controller, driven through jsdom.
//
//   node scripts/e2e-colordrop.mjs
//
// Covers the play loop (a full round of clean drops saves a score), a wrong
// drop (negative points, the answer chute revealed), and the accessibility
// invariant colordrop shares with colorpath: every swatch's pips agree with the
// color it is actually showing, on every board and after every drop.

import { JSDOM } from "jsdom";

const dom = new JSDOM(`<!DOCTYPE html><body><div id="app"></div></body>`, {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const { window } = dom;
// Force reduced motion so the drop animation resolves synchronously — the test
// asserts on settled state, not on setTimeout timing.
window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
for (const k of [
  "window", "document", "localStorage",
  "requestAnimationFrame", "cancelAnimationFrame", "HTMLElement",
  "CustomEvent", "Event", "getComputedStyle", "matchMedia",
]) {
  globalThis[k] = window[k];
}

const { ColorDropGame } = await import("../src/games/colordrop/game.js");
const { COLOR_NAMES, colorHex } = await import("../src/games/colordrop/colors.js");
const { PRIMARIES } = await import("../src/games/colordrop/board.js");
const { getResult, todayKey } = await import("../src/games/colordrop/results.js");

const TODAY = todayKey();
const ALL_COLORS = COLOR_NAMES.map((_, i) => i);

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.log(`  ✗ ${msg}`); }
};

function pipColor(el) {
  const pips = [...el.querySelectorAll(".cd-pip")];
  if (pips.length !== PRIMARIES.length) return -1;
  return PRIMARIES.reduce((acc, bit, i) => acc | (pips[i].classList.contains("is-on") ? bit : 0), 0);
}

/** Every swatch's pips match the fill it is showing. */
function pipMismatches(game) {
  const bad = [];
  for (const el of game.root.querySelectorAll(".cd-swatch[data-color]")) {
    const fill = el.style.getPropertyValue("--cell-color");
    const shown = ALL_COLORS.find((c) => colorHex(c) === fill) ?? -1;
    if (shown === -1) { bad.push(`unknown fill ${fill}`); continue; }
    const claimed = pipColor(el);
    if (claimed !== shown) bad.push(`fill ${COLOR_NAMES[shown]}, pips ${COLOR_NAMES[claimed] ?? claimed}`);
  }
  return bad;
}

const app = document.getElementById("app");

// ── picker ────────────────────────────────────────────────────────────────
{
  const game = new ColorDropGame(app, {});
  ok(game.root.querySelectorAll(".cd-pick").length === 3, "picker shows three tiers");
  game.destroy();
}

// ── a full clean round saves a score ────────────────────────────────────────
{
  const game = new ColorDropGame(app, { difficulty: "easy" });
  ok(game.boards.length === 5, "easy round has 5 boards");
  ok(game.root.querySelector(".cd-field"), "board renders a playfield");
  ok(game.root.querySelectorAll(".cd-wall").length === 3, "easy board has 3 walls (2 rows)");
  ok(pipMismatches(game).length === 0, "pips match fill on first board");

  let cleanLoop = true;
  for (let b = 0; b < game.boards.length; b++) {
    if (game.index !== b) cleanLoop = false;
    game._drop(game.boards[game.index].solutionLane);
    if (!game.root.querySelector(".cd-outcome-win")) cleanLoop = false;
    if (!game.root.querySelector(".cd-goalbar.is-hit")) cleanLoop = false;
    if (game.hits !== b + 1) cleanLoop = false;
    if (pipMismatches(game).length !== 0) cleanLoop = false;
    game.root.querySelector(".cd-next").click();
  }
  ok(cleanLoop, "each board: correct lane → clean drop, goal lights, hits climb, pips agree");
  ok(game.root.querySelector(".cd-win-score"), "round-complete screen shown");
  ok(game.score > 0, "positive score for a clean round");

  const res = getResult("easy", TODAY);
  ok(res && res.hits === 5 && res.boards === 5 && res.score > 0, "result persisted");
  game.destroy();
}

// ── a wrong drop is penalised ───────────────────────────────────────────────
{
  const game = new ColorDropGame(app, { difficulty: "hard", seed: "e2e-wrong" });
  const answer = game.boards[0].solutionLane;
  const lanes = 1 << game.boards[0].depth;
  const wrong = (answer + 1) % lanes;
  game._drop(wrong);
  ok(game.score < 0, "wrong drop yields negative score");
  ok(game.hits === 0, "wrong drop is not a hit");
  ok(game.root.querySelector(".cd-outcome-miss"), "miss outcome shown");
  ok(game.root.querySelector(".cd-goalbar.is-miss"), "goal bar shows a miss");
  ok(pipMismatches(game).length === 0, "pips match fill after a wrong drop");
  game.destroy();
}

// ── aiming maps drop x to the right lane ────────────────────────────────────
{
  const game = new ColorDropGame(app, { difficulty: "medium", seed: "e2e-aim" });
  const lanes = 1 << game.boards[0].depth;
  let aimOk = true;
  for (let L = 0; L < lanes; L++) {
    if (game._laneFromX((L + 0.5) / lanes) !== L) aimOk = false;
  }
  ok(aimOk, "each lane's center x resolves back to that lane");
  game.destroy();
}

console.log(`\n${fail === 0 ? "✓" : "✗"} e2e-colordrop: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
