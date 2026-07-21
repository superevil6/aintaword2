// Headless end-to-end test of the Color Path controller driven through jsdom.
//
//   node scripts/e2e-colorpath.mjs
//
// The focus is the non-colour encoding: every circle carries three pips saying
// which of red/yellow/blue it is mixed from, and that is the reading a player
// who cannot separate the hues depends on. A pip row that disagreed with its
// fill would be worse than no pips at all, so the invariant asserted here is
// "pips == fill" on every cell, on a fresh board and after every move.

import { JSDOM } from "jsdom";

const dom = new JSDOM(`<!DOCTYPE html><body><div id="app"></div></body>`, {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const { window } = dom;
for (const k of [
  "window", "document", "localStorage",
  "requestAnimationFrame", "cancelAnimationFrame", "HTMLElement",
]) {
  globalThis[k] = window[k];
}

const { ColorPathGame } = await import("../src/games/colorpath/game.js");
const { COLOR_NAMES, PRIMARIES, colorHex, paletteId } =
  await import("../src/games/colorpath/colors.js");

const ALL_COLORS = COLOR_NAMES.map((_, i) => i);

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else      { fail++; console.log(`  ✗ ${msg}`); }
};

/** The colour a cell's pips claim, read back out of the DOM. */
function pipColor(cell) {
  const pips = [...cell.querySelectorAll(".cp-pip")];
  if (pips.length !== PRIMARIES.length) return null;
  return PRIMARIES.reduce(
    (acc, { bit }, i) => acc | (pips[i].classList.contains("is-on") ? bit : 0),
    0,
  );
}

/** Every playable cell's pips agree with the colour it is actually showing. */
function pipsMatchFill(game) {
  const mismatches = [];
  game._cells.forEach((cell, idx) => {
    if (game.grid.isObstacle(idx)) return;
    const fill  = cell.style.getPropertyValue("--cell-color");
    const shown = ALL_COLORS.find((c) => colorHex(c) === fill) ?? -1;
    if (shown === -1) { mismatches.push(`${idx}: unknown fill ${fill}`); return; }
    const claimed = pipColor(cell);
    if (claimed !== shown) {
      mismatches.push(`${idx}: fill ${COLOR_NAMES[shown]}, pips ${COLOR_NAMES[claimed]}`);
    }
  });
  return mismatches;
}

const app = document.getElementById("app");

console.log("difficulty picker:");
const picker = new ColorPathGame(app, { seed: "e2e-colorpath" });
ok(document.querySelector(".cp-card-title")?.textContent === "Color Path", "title renders");
ok(document.querySelectorAll(".cp-pick").length === 3, "three difficulties offered");
const demoNodes = [...document.querySelectorAll(".cp-demo-node")];
ok(demoNodes.length > 0 && demoNodes.every((n) => n.querySelectorAll(".cp-pip").length === 3),
  "every tutorial circle carries three pips");
ok([...document.querySelectorAll(".cp-demo-btn")].every(
    (b) => [...b.querySelectorAll(".cp-pip")].filter((p) => p.classList.contains("is-on")).length === 1),
  "each tutorial primary button lights exactly its own pip");
picker.destroy();

console.log("\nfresh board:");
const game = new ColorPathGame(app, { difficulty: "medium", seed: "e2e-colorpath" });
const cells = game._cells;
ok(cells.length === game.size * game.size, `${cells.length} cells built`);
ok(cells.every((c, i) => game.grid.isObstacle(i) || c.querySelectorAll(".cp-pip").length === 3),
  "every playable circle carries three pips");
ok(pipsMatchFill(game).length === 0, "pips agree with fills on the opening board");
ok(cells.every((c, i) => game.grid.isObstacle(i) || c.style.getPropertyValue("--cell-ink")),
  "every circle sets an ink colour for its pips");

console.log("\nprimary buttons:");
const btns = game._primaryBtns;
ok(btns.length === 3, "three primaries");
ok(btns.every((b) => b.querySelector(".cp-primary-sign")), "each has a +/- sign element");
ok(btns.every((b, i) => b.querySelector(".cp-primary-name").textContent === PRIMARIES[i].name),
  "each is named in visible text, not only in its aria-label");
ok(btns.every((b) => [...b.querySelectorAll(".cp-pip")].filter((p) => p.classList.contains("is-on")).length === 1),
  "each lights exactly the pip slot it flips");
ok(btns.every((b) => b.querySelector(".cp-primary-sign").textContent === "+"),
  "all three read + from white, which holds no primaries");

console.log("\nwalking the board:");
let moved = 0, drift = null, sawRemove = false;
for (let step = 0; step < 12 && drift === null; step++) {
  const bit = PRIMARIES.map((p) => p.bit).find((b) => game.grid.targetsFor(b).length > 0);
  if (bit === undefined) break;
  const [dest] = game.grid.targetsFor(bit);
  game._resolveMove(dest);
  if (game._closeModal) { game._closeModal(false); continue; } // backtrack prompt
  moved++;
  sawRemove ||= btns.some((b) => b.querySelector(".cp-primary-sign").textContent === "−");
  const bad = pipsMatchFill(game);
  if (bad.length) drift = bad;
}
ok(moved >= 5, `walked ${moved} moves`);
ok(drift === null, drift ? `pips drifted from fills — ${drift[0]}` : "pips track the fill through every move, trail included");

const current = cells[game.grid.currentIndex];
ok(pipColor(current) === game.grid.currentColor,
  "the circle you are standing on spells out the colour you are carrying");
ok(sawRemove, "a primary you already hold flips to − while you are carrying it");

console.log("\ncolourblind palette toggle:");
const toggle = app.querySelector(".cp-toggle-box");
ok(!!toggle, "the board carries the toggle, so you need not abandon a run to reach it");
ok(paletteId() === "classic", "defaults to the classic mixing palette");
const before = {
  fills:   cells.map((c) => c.style.getPropertyValue("--cell-color")),
  pips:    cells.map(pipColor),
  moves:   game.grid.moves,
  primary: btns.map((b) => b.style.getPropertyValue("--primary-color")),
};

toggle.checked = true;
toggle.dispatchEvent(new window.Event("change"));

ok(paletteId() === "cvd", "checking the box switches palette");
ok(cells.every((c, i) => game.grid.isObstacle(i)
    || c.style.getPropertyValue("--cell-color") !== before.fills[i]),
  "every circle takes a new fill");
ok(btns.every((b, i) => b.style.getPropertyValue("--primary-color") !== before.primary[i]),
  "the control buttons swap too, rather than stranding on the old palette");
ok(pipsMatchFill(game).length === 0, "pips still agree with fills after the swap");
ok(cells.every((c, i) => pipColor(c) === before.pips[i]),
  "the pips themselves are unchanged — the swap is colour only");
ok(game.grid.moves === before.moves, "the run in progress survives the swap");

toggle.checked = false;
toggle.dispatchEvent(new window.Event("change"));
ok(paletteId() === "classic", "unchecking goes back");
ok(cells.every((c, i) => game.grid.isObstacle(i)
    || c.style.getPropertyValue("--cell-color") === before.fills[i]),
  "and restores the exact fills it started with");

console.log("\ncollected targets:");
const collected = [...game.grid.collected];
ok(collected.length === 0 || collected.every((i) => cells[i].classList.contains("cp-cell--collected")),
  "collected circles carry the class the tick mark hangs off");

game.destroy();

console.log("\nthe preference is remembered:");
toggle.checked = true;
toggle.dispatchEvent(new window.Event("change"));
ok(localStorage.getItem("colorpath:palette") === "cvd", "the choice is written to storage");
const returning = new ColorPathGame(app, { difficulty: "easy", seed: "e2e-colorpath" });
ok(app.querySelector(".cp-toggle-box").checked,
  "a board built while it is on comes up with the box already checked");
ok(pipsMatchFill(returning).length === 0, "and its pips agree with its fills");
returning.destroy();

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
