// Headless end-to-end test of the Vanity Plate controller through jsdom.
//
//   node scripts/e2e-vanityplate.mjs
//
// What's worth guarding here (not the pixels):
//
//  1. The course the BUILDER froze is the course the SCREEN plays. Every hole's
//     stored par example must actually satisfy its plate, be a real word, and
//     be exactly `par` letters — otherwise the hint lies or par is unreachable.
//  2. The refine-to-par loop enforces "shorter only": a parked word cannot be
//     replaced by something the same length or longer, and driving on records
//     the parked word's strokes (plus any hint penalty).
//  3. Scoring is golf: strokes summed, diff-vs-par per hole, birdie when a legal
//     word beats par. Play the par word on every hole → the round is even par.
//  4. A real sub-par word scores a birdie and the total drops below par.

import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const dom = new JSDOM(`<!DOCTYPE html><body><div id="app"></div></body>`, {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const { window } = dom;
for (const k of ["window", "document", "localStorage", "HTMLElement", "Node"]) {
  globalThis[k] = window[k];
}

const { VanityPlateGame } = await import("../src/games/vanityplate/game.js");
const { satisfies } = await import("../src/games/vanityplate/engine.js");
const { DIFFICULTY_ORDER } = await import("../src/games/vanityplate/difficulty.js");
const { PLATE: DEMO_PLATE, FRAMES: DEMO_FRAMES } = await import("../src/games/vanityplate/tutorial.js");

// A real dictionary stand-in: the same ENABLE list the app validates against.
const enable = new Set(
  readFileSync(new URL("../public/data/dictionary.txt", import.meta.url), "utf8")
    .split("\n").map((w) => w.trim()).filter(Boolean),
);
const dict = { isWord: (w) => enable.has(String(w).toLowerCase()) };

const day = "2026-07-22";
const daily = JSON.parse(
  readFileSync(new URL(`../public/data/vanityplate/${day}.json`, import.meta.url), "utf8"),
);

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; }
  else { fail++; console.log(`  ✗ ${msg}`); }
};

// ── 1. builder/screen agreement on every hole of every tier ──────────────────
for (const id of DIFFICULTY_ORDER) {
  const set = daily.sets[id];
  let sum = 0;
  for (const h of set.holes) {
    const p = h.plate.toLowerCase();
    ok(satisfies(h.ex, p), `${id} ${h.plate}: par word "${h.ex}" satisfies plate`);
    ok(enable.has(h.ex), `${id} ${h.plate}: par word "${h.ex}" is a real word`);
    ok(h.ex.length === h.par, `${id} ${h.plate}: par word length == par`);
    ok(h.birdie == null || h.birdie < h.par, `${id} ${h.plate}: birdie beats par`);
    sum += h.par;
  }
  ok(sum === set.par, `${id}: hole pars sum to course par`);
}

// ── tutorial demo is rules-accurate (never teaches a match the board rejects) ─
{
  const p = DEMO_PLATE.toLowerCase();
  let prevLen = Infinity;
  for (const { word } of DEMO_FRAMES) {
    const w = word.toLowerCase();
    ok(satisfies(w, p), `demo word "${word}" satisfies the plate ${DEMO_PLATE}`);
    ok(enable.has(w), `demo word "${word}" is a real word`);
    ok(w.length < prevLen, `demo word "${word}" is shorter than the last — shows the point`);
    prevLen = w.length;
  }
  ok(DEMO_FRAMES.at(-1).word.length === DEMO_PLATE.length, "demo ends at par (plate-length word)");
}

// helpers to drive the DOM the way a player would
const app = document.getElementById("app");
function typeAndSubmit(word) {
  const inp = app.querySelector("#vp-in");
  const form = app.querySelector("#vp-form");
  inp.value = word;
  inp.dispatchEvent(new window.Event("input", { bubbles: true }));
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
}
const parkedLen = () =>
  app.querySelector(".vp-verdict")?.textContent.match(/(\d+) letters/)?.[1];

// ── the garage shows the demo, and starting/leaving a course removes it ───────
{
  const game = new VanityPlateGame(app, { dict, daily, day });
  ok(app.querySelector(".vp-demo"), "garage mounts the how-to demo");
  app.querySelector('.vp-card[data-id="easy"]').click();
  ok(!app.querySelector(".vp-demo"), "starting a course tears the demo down");
  game.destroy();
}

// ── 2 & 3. play the PAR word on every easy hole → even par ───────────────────
{
  const game = new VanityPlateGame(app, { dict, daily, day, difficulty: "easy" });
  const holes = daily.sets.easy.holes;
  for (let i = 0; i < holes.length; i++) {
    const h = holes[i];
    // a legal but longer word first...
    const longer = h.ex + (enable.has(h.ex + "s") ? "s" : "");
    if (longer !== h.ex && satisfies(longer, h.plate.toLowerCase()) && enable.has(longer)) {
      typeAndSubmit(longer);
      ok(parkedLen() === String(longer.length), `easy hole ${i + 1}: parked the longer word`);
      // now the shorter par word must be accepted (shorter than parked)...
      typeAndSubmit(h.ex);
      ok(parkedLen() === String(h.ex.length), `easy hole ${i + 1}: par word replaced longer`);
      // ...and re-submitting the longer word must be REJECTED (not shorter)
      typeAndSubmit(longer);
      ok(parkedLen() === String(h.ex.length), `easy hole ${i + 1}: longer word rejected after par`);
    } else {
      typeAndSubmit(h.ex);
      ok(parkedLen() === String(h.ex.length), `easy hole ${i + 1}: parked par word`);
    }
    app.querySelector("#vp-drive").click();
  }
  const total = app.querySelector(".vp-total-big");
  ok(total && /even par/.test(total.textContent), "easy: playing every par word finishes even par");
  game.destroy();
}

// ── 4. a genuine birdie drops below par ──────────────────────────────────────
{
  // find a tier+hole that has a birdie, then find a real sub-par word for it
  let found = null;
  for (const id of DIFFICULTY_ORDER) {
    const h = daily.sets[id].holes.find((x) => x.birdie != null);
    if (h) { found = { id, h }; break; }
  }
  ok(found, "at least one hole across tiers offers a birdie");
  if (found) {
    const { id, h } = found;
    const p = h.plate.toLowerCase();
    // brute-force a real word of birdie length that satisfies the plate
    let birdieWord = null;
    for (const w of enable) {
      if (w.length === h.birdie && satisfies(w, p)) { birdieWord = w; break; }
    }
    ok(birdieWord, `found a real ${h.birdie}-letter birdie word for ${h.plate}`);

    const game = new VanityPlateGame(app, { dict, daily, day, difficulty: id });
    const holes = daily.sets[id].holes;
    for (let i = 0; i < holes.length; i++) {
      const hole = holes[i];
      const word = hole === h ? birdieWord : hole.ex;
      typeAndSubmit(word);
      app.querySelector("#vp-drive").click();
    }
    const total = app.querySelector(".vp-total-big");
    const rel = total.textContent.trim();
    ok(rel.startsWith("-"), `${id}: a birdie makes the round under par (got "${rel}")`);
    game.destroy();
  }
}

console.log(`\nVanity Plate e2e: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
