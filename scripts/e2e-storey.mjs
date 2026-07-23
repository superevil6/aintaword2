// Headless end-to-end test of the Storey controller through jsdom.
//
//   node scripts/e2e-storey.mjs
//
// What's worth guarding (not the pixels):
//
//  1. The hand the BUILDER froze is the tower the SCREEN plays: every stored
//     optimal floor is a real word, bookended by consonants, its width its
//     length, and affordable from the hand.
//  2. Laying floors spends the right tiles, and building the whole optimal tower
//     scores EXACTLY par — the ceiling is reachable with the words we shipped.
//  3. A partial tower scores below par; undo puts the tiles (and the score) back.
//  4. The site picker shows the demo, and starting a build tears it down.

import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const dom = new JSDOM(`<!DOCTYPE html><body><div id="app"></div></body>`, {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const { window } = dom;
// CustomEvent included so the end-of-round announce (lifecycle.js) dispatches a
// real Event under jsdom instead of throwing — the shell's cross-sell hook.
for (const k of ["window", "document", "localStorage", "HTMLElement", "Node", "Event", "CustomEvent"]) {
  globalThis[k] = window[k];
}

const { StoreyGame } = await import("../src/games/storey/game.js");
const { pillarsOf, scoreTower } = await import("../src/games/storey/engine.js");
const { DIFFICULTY_ORDER, DIFFICULTIES } = await import("../src/games/storey/difficulty.js");
const { DEMO_FLOORS, GRAVITY: DEMO_GRAVITY } = await import("../src/games/storey/tutorial.js");
const { getResult, saveResult, todayKey } = await import("../src/games/storey/results.js");

// The store persists only "today"; any other day is an ephemeral archive replay.
const TODAY = todayKey();

const enable = new Set(
  readFileSync(new URL("../public/data/dictionary.txt", import.meta.url), "utf8")
    .split("\n").map((w) => w.trim()).filter(Boolean),
);
const dict = { isWord: (w) => enable.has(String(w).toLowerCase()) };

const day = "2026-07-22";
const daily = JSON.parse(
  readFileSync(new URL(`../public/data/storey/${day}.json`, import.meta.url), "utf8"),
);

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; } else { fail++; console.log(`  ✗ ${msg}`); }
};

// ── 1. builder/screen agreement on every stored floor ───────────────────────
for (const id of DIFFICULTY_ORDER) {
  const set = daily.sets[id];
  ok(set.gravity === DIFFICULTIES[id].gravity, `${id}: gravity matches profile`);
  for (const f of set.floors) {
    const w = f.word.toLowerCase();
    const p = pillarsOf(w);
    ok(enable.has(w), `${id}: floor "${w}" is a real word`);
    ok(p && p.width === f.width, `${id}: floor "${w}" width == length`);
  }
  // widths minus tower gravity == par
  ok(scoreTower(set.floors.map((f) => ({ width: f.width })), set.gravity) === set.par,
    `${id}: optimal floors score par ${set.par}`);
}

// ── tutorial demo is rules-accurate (real, bookended, net-positive, tapering) ─
{
  let prevW = Infinity;
  for (let h = 0; h < DEMO_FLOORS.length; h++) {
    const w = DEMO_FLOORS[h].word.toLowerCase();
    const p = pillarsOf(w);
    ok(enable.has(w), `demo word "${w}" is a real word`);
    ok(p, `demo word "${w}" is bookended by consonants`);
    ok(p && p.width - DEMO_GRAVITY * h > 0, `demo word "${w}" beats its storey's gravity`);
    ok(p && p.width <= prevW, `demo word "${w}" is no wider than the one below (tapering)`);
    if (p) prevW = p.width;
  }
}

// helpers to drive the DOM like a player — through the clickable letter collection
const app = document.getElementById("app");
function tapLetter(ch) {
  const chip = app.querySelector(`#st-rack [data-tile="${ch}"], #st-rack [data-vowel="${ch}"]`);
  if (!chip) throw new Error(`no chip for "${ch}" — not a letter in play`);
  chip.dispatchEvent(new window.Event("pointerdown", { bubbles: true, cancelable: true }));
}
function typeWord(word) {
  for (const ch of word.toLowerCase()) tapLetter(ch);
}
function layFloor(word) {
  typeWord(word);
  app.querySelector("#st-lay").click();
}
const floorCount = () => app.querySelectorAll(".st-tower .st-floor").length;
// Un-spent pillar tiles: consonant chips that haven't been dimmed to "used".
const tileCount = () => app.querySelectorAll("#st-rack .st-tile[data-tile]:not(.used)").length;

// ── 4. picker shows the demo; starting a build removes it ────────────────────
{
  const game = new StoreyGame(app, { dict, daily, day });
  ok(app.querySelector(".st-demo"), "site picker mounts the how-to demo");
  app.querySelector('.st-card[data-id="easy"]').click();
  ok(!app.querySelector(".st-demo"), "starting a build tears the demo down");
  ok(app.querySelector(".st-tower"), "the build screen shows the tower area");
  // the collection offers exactly the letters in play: the hand + 5 vowels
  ok(app.querySelectorAll("#st-rack .st-tile[data-tile]").length === daily.sets.easy.hand.length,
    "collection shows one chip per hand letter");
  ok(app.querySelectorAll("#st-rack .st-tile.vowel").length === 5, "the five free vowels are offered");
  game.destroy();
}

// ── 2. build the whole optimal tower → exactly par ───────────────────────────
for (const id of DIFFICULTY_ORDER) {
  const game = new StoreyGame(app, { dict, daily, day, difficulty: id });
  const set = daily.sets[id];
  const startTiles = tileCount();
  ok(startTiles === set.hand.length, `${id}: rack starts with the full hand`);

  for (const f of set.floors) layFloor(f.word.toUpperCase());
  ok(floorCount() === set.stories, `${id}: laid all ${set.stories} optimal floors`);

  app.querySelector("#st-finish").click();
  const big = app.querySelector(".st-total-big");
  ok(big && /on par/.test(big.textContent), `${id}: the optimal tower scores on par (got "${big?.textContent.trim()}")`);
  game.destroy();
}

// ── 3a. a partial tower scores below par ─────────────────────────────────────
{
  const game = new StoreyGame(app, { dict, daily, day, difficulty: "hard" });
  const set = daily.sets.hard;
  layFloor(set.floors[0].word.toUpperCase()); // just one floor
  app.querySelector("#st-finish").click();
  const big = app.querySelector(".st-total-big");
  ok(big && /below par/.test(big.textContent), `hard: one floor finishes below par (got "${big?.textContent.trim()}")`);
  game.destroy();
}

// ── 3b. undo restores tiles and hides the finish button at zero floors ───────
{
  const game = new StoreyGame(app, { dict, daily, day, difficulty: "easy" });
  const set = daily.sets.easy;
  const start = tileCount();
  layFloor(set.floors[0].word.toUpperCase());
  ok(floorCount() === 1, "easy: one floor laid");
  ok(tileCount() === start - 2, "easy: laying a floor spends two tiles");
  app.querySelector("#st-undo").click();
  ok(floorCount() === 0, "easy: undo removes the floor");
  ok(tileCount() === start, "easy: undo returns the two tiles to the rack");
  ok(app.querySelector("#st-finish").hidden, "easy: finish is hidden with an empty tower");
  game.destroy();
}

// ── off-pool letters aren't offered, and a non-word is refused ───────────────
{
  const game = new StoreyGame(app, { dict, daily, day, difficulty: "easy" });
  const hand = new Set(daily.sets.easy.hand);
  const offLetter = "bcdfghjklmnpqrstvwxyz".split("").find((c) => !hand.has(c));
  ok(!app.querySelector(`#st-rack [data-tile="${offLetter}"]`),
    `easy: off-pool letter "${offLetter}" isn't offered as a chip`);
  // three in-play letters that don't spell a word → refused, not laid
  typeWord(daily.sets.easy.hand.slice(0, 3).join(""));
  app.querySelector("#st-lay").click();
  ok(floorCount() === 0, "easy: a non-word from your letters is refused");
  ok(/isn't in the word list/.test(app.querySelector("#st-feed").textContent),
    "easy: the feedback explains why");
  game.destroy();
}

// ── archive replays are ephemeral (never persist, never clobber today) ───────
{
  localStorage.clear();
  const PAST = "2026-01-05";
  saveResult("easy", { score: 10, par: 20, stories: 3 }, PAST);
  ok(getResult("easy", PAST) === null, "a past-day result is not stored");
  ok(getResult("easy", TODAY) === null, "playing a past day doesn't leak into today");
  saveResult("easy", { score: 12, par: 20, stories: 3 }, TODAY);
  ok(getResult("easy", TODAY)?.score === 12, "today's result still persists");
  ok(getResult("easy", PAST) === null, "today's result doesn't appear under a past day");
  localStorage.clear();
}

console.log(`\nStorey e2e: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
