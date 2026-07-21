// Headless end-to-end test of the Photon Finish controller driven through jsdom.
//
//   node scripts/e2e-photonfinish.mjs
//
// Two things are worth testing here and they are not the rendering.
//
// The first is that the puzzle the GENERATOR promises is the puzzle the SCREEN
// presents. Generation guarantees a board is solvable at `solution`, unsolved
// at `start`, and solvable few enough other ways to be worth playing — but
// none of that is worth anything if the controller mutates its own copy of the
// notches, miscounts a move, or draws a beam the optics module did not
// compute. So every tier is solved here through the real keyboard path, and
// the win is read back off the DOM rather than off the object.
//
// The second is the non-colour encoding, the same invariant Color Path's e2e
// guards: an orb's three RYB pips must agree with the colour it is filled
// with. A player who cannot separate the hues is reading the pips, and pips
// that disagreed with their fill would be worse than no pips at all.

import { JSDOM } from "jsdom";

const dom = new JSDOM(`<!DOCTYPE html><body><div id="app"></div></body>`, {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const { window } = dom;
for (const k of [
  "window", "document", "localStorage",
  "requestAnimationFrame", "cancelAnimationFrame", "HTMLElement", "SVGElement", "Node",
]) {
  globalThis[k] = window[k];
}

const { PhotonFinishGame, KEY_STEP_COARSE, KEY_STEP_FINE } =
  await import("../src/games/photonfinish/game.js");
const { evaluate, tracePath, normalizeAngle, DEG, TAU } =
  await import("../src/games/photonfinish/optics.js");
const { NEUTRAL, MAX_LEVEL, LEVEL_NAMES } = await import("../src/games/photonfinish/levels.js");
const { buildShareText } = await import("../src/games/photonfinish/share.js");
const { setPuzzleData } = await import("../src/games/photonfinish/board.js");
const { PUZZLES } = await import("../src/data/photonfinishPuzzles.js");
setPuzzleData(PUZZLES); // mount() does this in the app; tests build the game directly
const { DIFFICULTY_ORDER, DIFFICULTIES } = await import("../src/games/photonfinish/difficulty.js");

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else      { fail++; console.log(`  ✗ ${msg}`); }
};

const app = document.getElementById("app");
const key = (k) => app.dispatchEvent(
  new window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }),
);


// ── The picker ─────────────────────────────────────────────────────────────

console.log("difficulty picker:");
const picker = new PhotonFinishGame(app, {});
ok(app.querySelector(".pf-card-title")?.textContent === "Photon Finish", "title renders");
ok(app.querySelectorAll(".pf-pick").length === 3, "three difficulties offered");
ok(app.querySelectorAll(".pf-rules li").length >= 5, "the rules are stated up front");
picker.destroy();
ok(app.innerHTML === "" && !app.classList.contains("pf"), "destroy leaves the shell clean");

// ── Each tier, solved through the keyboard ─────────────────────────────────

for (const tier of DIFFICULTY_ORDER) {
  const profile = DIFFICULTIES[tier];
  console.log(`\n${tier}:`);
  const game = new PhotonFinishGame(app, { difficulty: tier, seed: "e2e-photonfinish" });
  const { puzzle } = game;
  const emitterCount = puzzle.emitters.length;

  ok(emitterCount === profile.emitters, `${profile.emitters} emitters, as the profile asks`);
  ok(app.querySelectorAll(".pf-gate").length === profile.gates, "every gate is drawn");
  ok(app.querySelectorAll(".pf-gate.is-dark").length === profile.darkGates,
    `${profile.darkGates} of them are dark gates`);
  ok(app.querySelectorAll(".pf-emitter").length === emitterCount, "every emitter is drawn");
  ok(app.querySelectorAll(".pf-beam").length > 0, "beams are drawn");

  // The generator's contract, restated against the object the screen is using.
  ok(!evaluate(puzzle, puzzle.start).solved, "the board does not open already solved");
  ok(evaluate(puzzle, puzzle.solution).solved, "the recorded solution does solve it");
  puzzle.stats.windows.forEach((w, i) => {
    ok(w >= profile.minWindow && w <= profile.maxWindow,
      `beam ${i + 1} window is ${w} deg, want ${profile.minWindow}..${profile.maxWindow}`);
    ok(w > KEY_STEP_COARSE, `beam ${i + 1} window exceeds one keyboard step`);
  });
  // The measure that says the board can be reasoned about: how many visibly
  // distinct routes reach each finish line. More than one so there is a choice
  // to make, few enough to enumerate by eye.
  puzzle.stats.routes.forEach((n, i) => {
    ok(n >= profile.minRoutes && n <= profile.maxRoutes,
      `finish line ${i + 1} is reachable by ${n} routes ` +
      `(want ${profile.minRoutes}..${profile.maxRoutes})`);
  });
  ok(puzzle.goals.every((g) => profile.goalLevels.includes(g.level)),
    "every finish line asks for a level this tier allows");
  ok(puzzle.goals.every((g) => g.level !== NEUTRAL),
    "no finish line asks for the level the beams already start at");


  // What the screen draws must be what the model computed. Comparing counts
  // catches the failure that matters — a controller rendering a stale trace.
  const expectedSegments = puzzle.emitters.reduce((n, e, i) => n +
    evaluate(puzzle, game.angles).traces[i].segments
      .filter((s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 1e-6).length, 0);
  ok(app.querySelectorAll(".pf-beam").length === expectedSegments,
    "the beam the screen draws is the beam the optics module computed");
  ok(app.querySelectorAll(".pf-mirror").length === (puzzle.mirror ? 1 : 0),
    "the centre mirror is drawn");

  // Solve it through the real pointer path. Pressing a point that lies along
  // the solution ray sets exactly that angle, so this drives the interaction a
  // player uses rather than assigning angles behind its back.
  //
  // Note both beams have to be placed before ANYTHING is solved: they couple,
  // so beam 1 sitting correctly is not worth a goal until beam 2 is also
  // where it belongs. That is the whole point of the redesign, and it is why
  // this loop cannot check progress beam by beam the way it used to.
  const svg = app.querySelector("svg.pf-board");
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
  const aimAlong = (i, angle) => {
    const e = puzzle.emitters[i];
    const x = e.x + Math.cos(angle) * 12;
    const y = e.y + Math.sin(angle) * 12;
    svg.dispatchEvent(new window.MouseEvent("pointerdown",
      { clientX: x, clientY: y, bubbles: true, cancelable: true }));
    svg.dispatchEvent(new window.MouseEvent("pointerup",
      { clientX: x, clientY: y, bubbles: true, cancelable: true }));
  };

  for (let i = 0; i < emitterCount; i++) {
    key(String(i + 1));
    ok(game.selected === i, `pressing "${i + 1}" selects beam ${i + 1}`);
    aimAlong(i, puzzle.solution[i]);
    const off = normalizeAngle(game.angles[i] - puzzle.solution[i]);
    ok(Math.min(off, TAU - off) < 1e-6, `beam ${i + 1} aims where it was pointed`);
  }

  ok(game.done === true, "the board reports itself solved");
  ok(app.querySelector(".pf-done") !== null, "the win panel appears");
  ok(app.querySelectorAll(".pf-target.is-met").length === emitterCount,
    "every target chip reads as met");
  ok(app.querySelectorAll(".pf-goalgate.is-met").length === emitterCount,
    "every finish line is marked met");
  ok(app.querySelectorAll(".pf-goal-tick").length === emitterCount,
    "and each carries a tick on the board itself, not only in the chip above it");
  ok(game.moves > 0, "moves were counted");
  ok((app.querySelector(".pf-live")?.textContent || "").includes("Solved"),
    "the live region announces the win to a screen reader");

  // A solved board must stop listening, or a stray arrow key un-solves the
  // thing the player just finished.
  const frozen = game.angles.join(",");
  key("ArrowRight");
  key("2");
  ok(game.angles.join(",") === frozen, "input is inert once solved");

  game.destroy();
  ok(app.innerHTML === "" && !app.classList.contains("pf"), "destroy leaves the shell clean");
}

// ── Move counting ──────────────────────────────────────────────────────────
//
// The move count is the score, so it has to be honest: one press, one move,
// and turning a full circle back to where you started still cost you.

console.log("\nmove accounting:");
const counter = new PhotonFinishGame(app, { difficulty: "easy", seed: "e2e-moves" });
ok(counter.moves === 0, "a fresh board is at zero moves");
key("1");
ok(counter.moves === 0, "selecting a beam is not a move");
const startAngle = counter.angles[0];
key("ArrowRight");
ok(counter.moves === 1 &&
  Math.abs(normalizeAngle(counter.angles[0] - startAngle) * DEG - KEY_STEP_COARSE) < 1e-6,
  `one arrow press is one move and ${KEY_STEP_COARSE} degree`);
key("ArrowLeft");
ok(counter.moves === 2 && Math.abs(counter.angles[0] - startAngle) < 1e-9,
  "turning back costs a move and returns the beam exactly");

// Shift is the BIG step here, the opposite of the usual convention, because
// aim is continuous and most of the work is fine adjustment.
const beforeShift = counter.angles[0];
app.dispatchEvent(new window.KeyboardEvent("keydown",
  { key: "ArrowRight", shiftKey: true, bubbles: true, cancelable: true }));
ok(Math.abs(normalizeAngle(counter.angles[0] - beforeShift) * DEG - KEY_STEP_FINE) < 1e-6,
  `shift-arrow turns the bigger ${KEY_STEP_FINE} degrees`);
counter.destroy();

// ── Aiming ─────────────────────────────────────────────────────────────────
//
// Click-to-aim is the primary control, and the one whose absence made free
// rotation unusable: previously a press had to land on a 4-unit emitter dot or
// nothing happened at all. These drive the real pointer path.

console.log("\naiming:");
const aim = new PhotonFinishGame(app, { difficulty: "easy", seed: "e2e-aim" });
const board = app.querySelector("svg.pf-board");
// jsdom has no layout, so the board would measure 0x0 and every pointer event
// would be discarded. One board unit = one client pixel makes the arithmetic
// below readable.
board.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });

const press = (type, x, y, target) => (target || board).dispatchEvent(
  new window.MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true }),
);

const e0 = aim.puzzle.emitters[0];
aim.selected = 0;
const movesBefore = aim.moves;

// Aim at a point diagonally down-right of emitter 0.
const target = { x: e0.x + 20, y: e0.y + 20 };
press("pointerdown", target.x, target.y);
const wanted = Math.atan2(target.y - e0.y, target.x - e0.x);
ok(Math.abs(normalizeAngle(aim.angles[0]) - normalizeAngle(wanted)) < 1e-9,
  "pressing open board points the selected beam straight at that spot");
ok(aim.moves === movesBefore, "the move is not charged until the press is released");
press("pointerup", target.x, target.y);
ok(aim.moves === movesBefore + 1, "releasing charges exactly one move");

// A drag is still one move however far the beam sweeps — otherwise aiming by
// eye would cost more than nudging with the buttons.
const before = aim.moves;
press("pointerdown", e0.x + 20, e0.y);
for (let k = 1; k <= 12; k++) press("pointermove", e0.x + 20, e0.y + k * 2);
press("pointerup", e0.x + 20, e0.y + 24);
ok(aim.moves === before + 1, "a drag across many positions is one move, not one per step");

// Pressing an emitter selects it rather than aiming the previous one at it.
if (aim.puzzle.emitters.length > 1) {
  const node = app.querySelector('.pf-emitter[data-emitter="1"]');
  const e1 = aim.puzzle.emitters[1];
  press("pointerdown", e1.x, e1.y, node);
  ok(aim.selected === 1, "pressing an emitter selects it");
  press("pointerup", e1.x, e1.y, node);
}

console.log("\nturn buttons:");
const turnBtns = [...app.querySelectorAll(".pf-turns .pf-btn")];
ok(turnBtns.length === 4,
  "four turn buttons — coarse and fine, because 1 degree alone is invisible and " +
  "10 degrees alone could step over a solving window");
for (const btn of turnBtns) {
  const start = aim.angles[aim.selected];
  const moves = aim.moves;
  btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const moved = Math.abs(normalizeAngle(aim.angles[aim.selected] - start) * DEG);
  const turned = Math.min(moved, 360 - moved);
  ok(turned > 0.5, `"${btn.textContent}" visibly turns the beam (${turned.toFixed(1)} deg)`);
  ok(aim.moves === moves + 1, `"${btn.textContent}" costs exactly one move`);
}
ok(turnBtns.some((b) => b.textContent.includes(String(KEY_STEP_FINE))),
  `a coarse ${KEY_STEP_FINE} degree button exists for crossing the dial`);

// Held keys repeat; charging each repeat would make the keyboard cost dozens
// of moves for a sweep a drag does in one.
const heldFrom = aim.moves;
app.dispatchEvent(new window.KeyboardEvent("keydown",
  { key: "ArrowRight", bubbles: true, cancelable: true }));
for (let k = 0; k < 8; k++) {
  app.dispatchEvent(new window.KeyboardEvent("keydown",
    { key: "ArrowRight", repeat: true, bubbles: true, cancelable: true }));
}
ok(aim.moves === heldFrom + 1, "holding an arrow key is one move, matching a drag");
aim.destroy();

// ── Tutorial demo ────────────────────────────────────
//
// The picker's looping demo runs on a timer. The one thing that must hold is
// that leaving the picker STOPS it — a timer poking a detached node is a leak
// and, under jsdom, an error thrown into nowhere.

console.log("\ntutorial demo:");
const demoGame = new PhotonFinishGame(app, {});
ok(app.querySelector(".pf-demo") !== null, "the picker shows the demo");
ok(app.querySelectorAll(".pf-demo-svg line").length > 0, "the demo draws beams");
ok(demoGame._tutorialCleanup !== null, "the demo loop is running");
demoGame.start("easy");            // leaving the picker to play
ok(demoGame._tutorialCleanup === null, "playing a board stops the demo loop");
ok(app.querySelector(".pf-demo") === null, "and removes it from the DOM");
demoGame.destroy();

// ── Sharing ────────────────────────────────────────────────────────────────
//
// The share is a daily-only, spoiler-free brag. The two things that would ruin
// it are leaking the board and offering to share a practice run nobody else is
// playing — both asserted here.

console.log("\nsharing:");
const shareText = buildShareText({
  moves: 12, difficultyLabel: "Hard", daily: "2026-07-21", isRecord: true, url: "https://ex/g/photonfinish/",
});
ok(/Photon Finish/.test(shareText) && /12 moves/.test(shareText), "share names the game and the move count");
ok(/2026-07-21/.test(shareText) && /Hard/.test(shareText), "share carries the day and tier");
ok(/New best/.test(shareText), "a record run says so");
ok(!/new best/i.test(buildShareText({ moves: 12, difficultyLabel: "Hard", daily: "2026-07-21", isRecord: false, url: "" })),
  "a non-record run does not");
// The spoiler test: no goal brightness, no gate, no angle may appear.
ok(!/(brightness|level|gate|angle|goal|\b[034]\b)/i.test(shareText.replace(/2026-07-21|12 moves/g, "")),
  "share never leaks the board (no levels, gates or angles)");

const shareGame = new PhotonFinishGame(app, { difficulty: "easy" });
shareGame.angles = shareGame.puzzle.solution.slice();
shareGame._render();
ok(app.querySelector(".pf-share") !== null, "a solved DAILY board offers a share button");
shareGame.start("easy", { practice: true });
shareGame.angles = shareGame.puzzle.solution.slice();
shareGame._render();
ok(app.querySelector(".pf-share") === null, "a solved PRACTICE board does not — nobody else is on it");
shareGame.destroy();

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
