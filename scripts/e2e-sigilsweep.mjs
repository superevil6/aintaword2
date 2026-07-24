// Headless end-to-end test of the Sigil Sweep controller through jsdom.
//
//   node scripts/e2e-sigilsweep.mjs
//
// The marks are drawn on <canvas>, which jsdom does not implement — render.js
// no-ops on the missing context, so this test drives the real GAME LOOP and
// asserts on state, never pixels. What's worth guarding:
//
//  1. A full clean round (pick the answer on every mark) saves a positive score
//     and counts every mark as a first-glance hit.
//  2. Committing earlier in the sweep scores more than committing later — the
//     whole point of the game.
//  3. A wrong pick leaves one more try with the clock running; a correct second
//     try scores at the reduced multiplier; two wrong picks reveal the answer
//     and score nothing.
//  4. The mounted options are distinct and the recorded answer index really
//     points at the answer.
//  5. The picker shows the tutorial demo, and starting a round tears it down.

import { JSDOM, VirtualConsole } from "jsdom";

// jsdom emits a "not implemented: getContext" error per canvas; that's expected
// here (we test logic, not rendering) so drop those but keep any real errors.
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => {
  if (!/getContext|Canvas/i.test(String(e?.message))) console.error(e);
});

const dom = new JSDOM(`<!DOCTYPE html><body><div id="app"></div></body>`, {
  pretendToBeVisual: true, // provides requestAnimationFrame / cancelAnimationFrame
  url: "http://localhost/",
  virtualConsole: vc,
});
const { window } = dom;
for (const k of [
  "window", "document", "localStorage", "HTMLElement", "Node", "Event", "CustomEvent",
  "requestAnimationFrame", "cancelAnimationFrame", "devicePixelRatio",
]) {
  globalThis[k] = window[k];
}

const { SigilSweepGame } = await import("../src/games/sigilsweep/game.js");
const { scorePick, SECOND_GUESS } = await import("../src/games/sigilsweep/scoring.js");
const { sigilKey } = await import("../src/games/sigilsweep/sigil.js");
const { DIFFICULTIES } = await import("../src/games/sigilsweep/difficulty.js");
const { getResult, todayKey } = await import("../src/games/sigilsweep/results.js");

const TODAY = todayKey();

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.log(`  ✗ ${msg}`); }
};

const app = document.getElementById("app");
const opts = (game) => [...game._optionsEl.querySelectorAll(".sg-opt")];
/** Pick the correct option on the current mark, at a controlled sweep angle. */
function pickCorrect(game, degrees = 0) {
  game._degrees = degrees;
  const p = game.puzzles[game.index];
  opts(game)[p.answerIndex].click();
}

// ── picker + tutorial ────────────────────────────────────────────────────────
{
  const game = new SigilSweepGame(app, {});
  ok(game.root.querySelectorAll(".sg-pick").length === 3, "picker shows three tiers");
  ok(game.root.querySelector(".sg-demo-canvas"), "picker shows the tutorial demo");
  game.start("easy");
  ok(!game.root.querySelector(".sg-demo-canvas"), "starting a round tears the demo down");
  ok(game.root.querySelector(".sg-sweep"), "the sweep canvas is mounted");
  game.destroy();
}

// ── a full clean round saves a score ─────────────────────────────────────────
{
  const game = new SigilSweepGame(app, { difficulty: "easy", seed: "e2e-clean" });
  ok(game.puzzles.length === DIFFICULTIES.easy.rounds, "easy round has 5 marks");
  ok(opts(game).length === 4, "easy mark shows 4 options");

  let clean = true;
  for (let b = 0; b < game.puzzles.length; b++) {
    if (game.index !== b) clean = false;
    const p = game.puzzles[b];
    // options distinct + answer index sound, on the actual mounted puzzle
    const keys = p.options.map(sigilKey);
    if (new Set(keys).size !== keys.length) clean = false;
    if (sigilKey(p.options[p.answerIndex]) !== sigilKey(p.answer)) clean = false;

    pickCorrect(game, 0);
    if (!game.root.querySelector(".sg-opt.is-right")) clean = false;
    if (game.hits !== b + 1) clean = false;
    game.root.querySelector(".sg-next").click();
  }
  ok(clean, "each mark: correct pick lights green, hits climb, options are sound");
  ok(game.root.querySelector(".sg-win-score"), "round-complete screen shown");
  ok(game.score > 0, "positive score for a clean round");

  const res = getResult("easy", TODAY);
  ok(res && res.hits === 5 && res.rounds === 5 && res.score > 0, "result persisted");
  game.destroy();
}

// ── earlier commit scores more ───────────────────────────────────────────────
{
  const early = new SigilSweepGame(app, { difficulty: "medium", seed: "e2e-speed" });
  pickCorrect(early, 0);
  const earlyScore = early.score;
  early.destroy();

  const late = new SigilSweepGame(app, { difficulty: "medium", seed: "e2e-speed" });
  pickCorrect(late, 720);
  const lateScore = late.score;
  late.destroy();

  ok(earlyScore > lateScore, `committing at 0° (${earlyScore}) beats 720° (${lateScore})`);
}

// ── a wrong pick leaves one more try ─────────────────────────────────────────
{
  const game = new SigilSweepGame(app, { difficulty: "hard", seed: "e2e-wrong" });
  const p = game.puzzles[0];
  const wrong = (p.answerIndex + 1) % p.options.length;

  game._degrees = 0;
  opts(game)[wrong].click();
  ok(!game._resolved, "one wrong pick does not end the mark");
  ok(opts(game)[wrong].classList.contains("is-wrong"), "the wrong option is marked wrong");
  ok(opts(game)[wrong].disabled, "the wrong option is disabled");

  // now the correct one, on the second try → reduced multiplier, not a hit
  game._degrees = 0;
  opts(game)[p.answerIndex].click();
  ok(game._resolved, "the correct second pick resolves the mark");
  ok(game.hits === 0, "a second-try correct pick is not a first-glance hit");
  ok(game.score === scorePick({ correct: true, degrees: 0, guessIndex: 1 }),
    `second-try score uses the ×${SECOND_GUESS} multiplier`);
  game.destroy();
}

// ── two wrong picks reveal the answer, score nothing ─────────────────────────
{
  const game = new SigilSweepGame(app, { difficulty: "hard", seed: "e2e-bust" });
  const p = game.puzzles[0];
  const wrongs = [...p.options.keys()].filter((i) => i !== p.answerIndex).slice(0, 2);

  game._degrees = 0;
  opts(game)[wrongs[0]].click();
  opts(game)[wrongs[1]].click();
  ok(game._resolved, "two wrong picks end the mark");
  ok(game.score === 0, "a busted mark scores nothing");
  ok(opts(game)[p.answerIndex].classList.contains("is-answer"), "the answer is revealed on a bust");
  game.destroy();
}

console.log(`\n${fail === 0 ? "✓" : "✗"} e2e-sigilsweep: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
