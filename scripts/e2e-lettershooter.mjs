// Headless end-to-end test of the Letter Shooter controller through jsdom.
//
//   node scripts/e2e-lettershooter.mjs
//
// A timing game can't be driven by pixels in jsdom, so we drive it through the
// game's test seams: _grab(letter) applies a grab as if you'd timed it, and
// _flushBust() resolves a bust immediately instead of after the toast delay.
// What's worth guarding (not the animation):
//
//  1. The picker shows the how-to demo; starting a level tears it down and shows
//     the stage. The demo word is real and threads its rows.
//  2. Playing each round's shipped best word and cashing it banks EXACTLY par —
//     the ceiling is reachable with the words we shipped.
//  3. Busting every round finishes below par; grabbing a dead-end letter busts.
//  4. Every day persists under its own date (archive replays included), and the
//     legacy single-day blob migrates in place.

import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const dom = new JSDOM(`<!DOCTYPE html><body><div id="app"></div></body>`, {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const { window } = dom;
for (const k of ["window", "document", "localStorage", "HTMLElement", "Node", "Event", "CustomEvent"]) {
  globalThis[k] = window[k];
}

const { LetterShooterGame } = await import("../src/games/lettershooter/game.js");
const { DIFFICULTY_ORDER } = await import("../src/games/lettershooter/difficulty.js");
const { DEMO_WORD } = await import("../src/games/lettershooter/tutorial.js");
const { getResult, saveResult, playedDates, todayKey } = await import("../src/games/lettershooter/results.js");
const { loadLexicon } = await import("./lib-lettershooter.mjs");

const TODAY = todayKey();
const dict = loadLexicon(); // isWord + isPrefix over ENABLE

const day = "2026-07-22";
const daily = JSON.parse(
  readFileSync(new URL(`../public/data/lettershooter/${day}.json`, import.meta.url), "utf8"),
);

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; } else { fail++; console.log(`  ✗ ${msg}`); }
};

const app = document.getElementById("app");

// ── 1. the how-to demo is rules-accurate ─────────────────────────────────────
{
  ok(dict.isWord(DEMO_WORD.toLowerCase()), `demo word "${DEMO_WORD}" is a real word`);
  let alive = true;
  for (let k = 2; k <= DEMO_WORD.length; k++) {
    if (!dict.isPrefix(DEMO_WORD.slice(0, k).toLowerCase())) alive = false;
  }
  ok(alive, `demo word "${DEMO_WORD}" stays a live prefix at every step`);
}

// ── 2. picker shows the demo; starting a level removes it and shows the stage ─
{
  const game = new LetterShooterGame(app, { dict, daily, day });
  ok(app.querySelector(".ls-demo"), "level picker mounts the how-to demo");
  ok(app.querySelectorAll(".ls-card[data-id]").length === 3, "three level cards are offered");
  app.querySelector('.ls-card[data-id="easy"]').click();
  ok(!app.querySelector(".ls-demo"), "starting a level tears the demo down");
  ok(app.querySelector("#ls-stage"), "the play screen shows the stage");
  ok(app.querySelectorAll(".ls-strip").length === 5, "easy shows five look-ahead rows");
  game.destroy();
}

// helpers to drive a run through the test seams
function bustCurrent(game) {
  // find a letter that dead-ends the current word, grab it, resolve the bust
  for (const c of "abcdefghijklmnopqrstuvwxyz") {
    if (!dict.isPrefix(game.word + c)) { game._grab(c); game._flushBust(); return; }
  }
  throw new Error("no dead-end letter exists (impossible for any prefix)");
}
function playPar(game, set) {
  for (let r = 0; r < set.best.length; r++) {
    const w = String(set.best[r].word).toLowerCase();
    if (w) {
      for (let k = 1; k < w.length; k++) game._grab(w[k]);
      game.cash();
    } else {
      bustCurrent(game); // no familiar word this round → 0, same as par
    }
  }
}

// ── 2b. playing every round's best word banks exactly par ────────────────────
for (const id of DIFFICULTY_ORDER) {
  const game = new LetterShooterGame(app, { dict, daily, day, difficulty: id });
  const set = daily.sets[id];
  playPar(game, set);
  const big = app.querySelector(".ls-total-big");
  ok(big && /on par/.test(big.textContent), `${id}: playing the best words scores on par (got "${big?.textContent.trim()}")`);
  ok(getResult(id, day)?.score === set.par, `${id}: banked score equals par ${set.par}`);
  game.destroy();
}

// ── 3. busting every round finishes below par ────────────────────────────────
{
  const id = "medium";
  const game = new LetterShooterGame(app, { dict, daily, day, difficulty: id });
  const set = daily.sets[id];
  for (let r = 0; r < 5; r++) bustCurrent(game);
  const big = app.querySelector(".ls-total-big");
  ok(big && /below par/.test(big.textContent), `${id}: busting every round finishes below par (got "${big?.textContent.trim()}")`);
  ok(getResult(id, day)?.score === 0, `${id}: a busted run banks 0 against par ${set.par}`);
  game.destroy();
}

// ── a single grab of a dead-end letter busts (forfeits the word) ─────────────
{
  const game = new LetterShooterGame(app, { dict, daily, day, difficulty: "easy" });
  const startWord = game.word;
  bustCurrent(game);
  ok(game.round === 1, "a dead-end grab ends the round");
  ok(game.word !== startWord, "the next round starts a fresh word");
  game.destroy();
}

// ── 4. every day persists under its own date (archive replays included) ──────
{
  localStorage.clear();
  const PAST = "2026-01-05";
  saveResult("easy", { score: 40, par: 200, rounds: 3 }, PAST);
  ok(getResult("easy", PAST)?.score === 40, "a past-day result is stored under its date");
  ok(getResult("easy", TODAY) === null, "playing a past day doesn't leak into today");
  saveResult("easy", { score: 55, par: 200, rounds: 4 }, TODAY);
  ok(getResult("easy", TODAY)?.score === 55, "today's result persists independently");
  ok(getResult("easy", PAST)?.score === 40, "the past day's result is untouched by today's");
  const played = new Set(playedDates());
  ok(played.has(PAST) && played.has(TODAY), "playedDates lists every completed date");
  localStorage.clear();
}

// ── legacy single-day blob migrates into per-date history in place ───────────
{
  localStorage.clear();
  const LEGACY = "2025-12-01";
  localStorage.setItem(
    "aintaword2:lettershooter:daily",
    JSON.stringify({ date: LEGACY, results: { easy: { score: 33, par: 180, rounds: 2, playedAt: "x" } } }),
  );
  ok(getResult("easy", LEGACY)?.score === 33, "old {date,results} blob is read under its date");
  ok(new Set(playedDates()).has(LEGACY), "migrated day shows up in playedDates");
  localStorage.clear();
}

console.log(`\nLetter Shooter e2e: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
