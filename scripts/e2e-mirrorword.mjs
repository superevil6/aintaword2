// Headless end-to-end test of the Mirrorword controller driven through jsdom.
//
//   node scripts/e2e-mirrorword.mjs
//
// verify-mirrorword.mjs proves the square maths; this proves the thing a player
// touches. The invariants are the ones whose failure looks like a broken game
// rather than a wrong answer: given cells that can be overwritten, a letter that
// fails to mirror across the diagonal, a completed square that never registers
// as a win (the bug that actually bit the prototype), a Finish that banks the
// wrong score, a share string that leaks the answer, and a tier that replays
// instead of showing its stored result.

import { JSDOM } from "jsdom";

const dom = new JSDOM(`<!DOCTYPE html><body><div id="app"></div></body>`, {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const { window } = dom;
// CustomEvent/Event come from jsdom too: lifecycle.js's announceRoundComplete
// constructs a CustomEvent, and jsdom's dispatchEvent rejects any Event not made
// from its own window (Node 24 has a global CustomEvent that would shadow it).
for (const k of ["window", "document", "localStorage", "HTMLElement", "Node", "KeyboardEvent", "CustomEvent", "Event"]) {
  globalThis[k] = window[k];
}

const { MirrorwordGame } = await import("../src/games/mirrorword/game.js");
const { WORDS } = await import("../src/data/rootwordPool.js");
const { DIFFICULTY_ORDER, DIFFICULTIES } = await import("../src/games/mirrorword/difficulty.js");
const { isSolved, scoreSquare, poolOfLength } = await import("../src/games/mirrorword/engine.js");
const { buildShareText } = await import("../src/games/mirrorword/share.js");
const { getResult, saveResult, playedDates, todayKey } = await import("../src/games/mirrorword/results.js");

// Persistence runs against the real today so the save path exercises the live
// key; todayKey is constant during one process, so it's stable within the run.
const TODAY = todayKey();

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.log(`  ✗ ${msg}`); } };
const section = (name) => console.log(`\n${name}:`);

const host = () => document.getElementById("app");
let current = null;
const mount = (opts = {}) => {
  current?.destroy();
  host().innerHTML = "";
  localStorage.clear();
  current = new MirrorwordGame(host(), { pool: WORDS, day: TODAY, ...opts });
  return current;
};

const key = (ch) => document.dispatchEvent(new window.KeyboardEvent("keydown", { key: ch, bubbles: true }));

for (const id of DIFFICULTY_ORDER) {
  section(`${DIFFICULTIES[id].label} (${DIFFICULTIES[id].size}×${DIFFICULTIES[id].size})`);
  const g = mount({ difficulty: id });
  const n = g.puzzle.size;

  // Given top row is the seed; left column mirrors it.
  ok(g.grid[0].join("") === g.puzzle.seed, "top row is the given seed");
  ok(Array.from({ length: n }, (_, r) => g.grid[r][0]).join("") === g.puzzle.seed, "left column mirrors the seed");

  // Given cells reject input: aim a letter at (0,0), it must not change.
  g.selR = 0; g.selC = 0; key("z");
  ok(g.grid[0][0] === g.puzzle.seed[0], "given cell can't be overwritten");

  const prof = DIFFICULTIES[id];
  const best = g.puzzle.best;

  // Center hint: present on Easy/Medium, drawn from the optimal, and erasable.
  if (prof.hint) {
    const keys = [...g.hint.keys()];
    ok(keys.length === prof.hint, `${prof.hint} center hint(s) shown`);
    // EVERY hint cell, not just the first. Checking only keys[0] let a bug hide
    // where typing at a given cell redirected onto (1,1) and overwrote the hint
    // there — invisible on Medium, whose keys[0] is (2,2).
    const allOptimal = keys.every((k) => {
      const [r, c] = k.split(",").map(Number);
      return g.grid[r][c] === best[r][c];
    });
    ok(allOptimal, "every hint is the optimal center letter");
    ok(keys.every((k) => !g.given.has(k)), "hint cells are erasable, not locked");

    // Typing while a given cell is selected must not land on a hint.
    g.selR = 0; g.selC = 0; key("z");
    const survived = keys.every((k) => {
      const [r, c] = k.split(",").map(Number);
      return g.grid[r][c] === g.hint.get(k);
    });
    ok(survived, "typing at a given cell doesn't overwrite a hint");
    g._clear();
  } else {
    ok(!g.hint || g.hint.size === 0, "no hint on this tier");
  }

  // Fill the PAR square by explicitly selecting each empty upper-triangle cell
  // (robust to the hint pre-fill and the skip-filled auto-advance).
  for (let r = 0; r < n; r++) for (let c = r; c < n; c++) {
    if (g.given.has(r + "," + c)) continue;
    if (g.grid[r][c] === best[r][c]) continue; // already correct (the hint)
    g.selR = r; g.selC = c; key(best[r][c]);
  }

  // Mirror invariant across the whole grid.
  let sym = true;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (g.grid[r][c] !== g.grid[c][r]) sym = false;
  ok(sym, "every placed letter reflected across the diagonal");

  ok(isSolved(g.grid, g.puzzle.wordSet), "completed board is a valid symmetric word square");
  ok(g.solvedOnce && g.bestScore === g.puzzle.par, `win registered and banked par (${g.bestScore}/${g.puzzle.par})`);
  ok(!g._finishBtn.disabled, "Finish enabled after a valid square");

  // Finish → result stored; re-mounting the tier shows the stored result.
  g._finish();
  const stored = getResult(id, TODAY);
  ok(stored && stored.score === g.puzzle.par && stored.par === g.puzzle.par, "Finish stored best/par");
  ok(host().querySelector(".mw-result-card"), "result screen shown after Finish");

  // Share text is spoiler-free: it must contain no row word.
  const share = buildShareText({ score: stored.score, par: stored.par, size: n, difficultyLabel: id, daily: TODAY, url: "" });
  const leaks = best.some((w) => share.toLowerCase().includes(w));
  ok(!leaks, "share text leaks no answer word");
  ok(scoreSquare(best) === g.puzzle.par, "optimal score equals par (sanity)");
}

// Per-date history: every completed day persists under its own date, and the
// archive can list which days were played. A past day never clobbers today.
section("Per-date history persists");
{
  localStorage.clear();
  const PAST = "2026-01-05";
  saveResult("easy", { score: 10, par: 20 }, PAST);
  ok(getResult("easy", PAST)?.score === 10, "a past-day result is stored under its date");
  ok(getResult("easy", TODAY) === null, "a past-day result doesn't leak into today");
  saveResult("easy", { score: 12, par: 20 }, TODAY);
  ok(getResult("easy", TODAY)?.score === 12, "today's result persists independently");
  ok(getResult("easy", PAST)?.score === 10, "the past day is untouched by today's save");
  const days = playedDates();
  ok(days.includes(PAST) && days.includes(TODAY), "playedDates lists both completed days");
}

// The old single-day blob shape migrates into the per-date store on read.
section("Legacy blob migrates");
{
  localStorage.clear();
  localStorage.setItem(
    "aintaword2:mirrorword:daily",
    JSON.stringify({ date: "2026-02-02", results: { easy: { score: 7, par: 20 } } }),
  );
  ok(getResult("easy", "2026-02-02")?.score === 7, "legacy result readable at its date");
  ok(playedDates().includes("2026-02-02"), "legacy day appears in playedDates");
}

// Backspace and clear behave.
section("Editing");
{
  const g = mount({ difficulty: "easy" });
  // An OFF-DIAGONAL, non-hint cell. Off-diagonal so "fills its mirror" compares
  // two distinct cells rather than one cell with itself; non-hint so _clear()
  // restoring the scaffold (covered under "Hint erasability") doesn't masquerade
  // as Clear failing to empty the board.
  let fr = -1, fc = -1;
  outer: for (let r = 0; r < g.puzzle.size; r++) for (let c = 0; c < g.puzzle.size; c++) {
    if (r === c || !g._isFillable(r, c) || g.hint.has(r + "," + c)) continue;
    fr = r; fc = c; break outer;
  }
  ok(fr >= 0, "found an off-diagonal non-hint cell to edit");
  g.selR = fr; g.selC = fc; key("q");
  ok(g.grid[fr][fc] === "q" && g.grid[fc][fr] === "q", "press fills cell and its mirror");
  key("Backspace");
  // after press we auto-advanced; backspace steps back and clears
  ok(g.grid[fr][fc] === "", "backspace clears the mirrored fill");
  g.selR = fr; g.selC = fc; key("w");
  g._clear();
  ok(g.grid[fr][fc] === "", "clear empties fillable cells");

  // A lower-triangle (reflected) cell is now directly editable, and sets its pair.
  ok(g._isFillable(2, 1) && !g.given.has("2,1"), "lower-triangle cell is editable");
  g.selR = 2; g.selC = 1; key("t");
  ok(g.grid[2][1] === "t" && g.grid[1][2] === "t", "editing a lower cell fills its mirror");
  // ...and the given seed cells stay locked from either side.
  ok(!g._isFillable(0, 0) && !g._isFillable(3, 0), "seed cells (row 0 / col 0) stay locked");
}

section("Tutorial demo");
{
  const { FRAMES, CAPTIONS, DEMO_SQUARE, GIVEN } = await import("../src/games/mirrorword/tutorial.js");
  const pool3 = new Set(poolOfLength(WORDS, 3));
  ok(FRAMES.length === CAPTIONS.length, "one caption per frame");

  const fin = FRAMES[FRAMES.length - 1];
  const rows = [0, 1, 2].map((r) => fin.slice(r * 3, r * 3 + 3).join(""));
  ok(rows.join(",") === DEMO_SQUARE.join(","), "final frame is the demo square");
  let sym = true;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (fin[r * 3 + c] !== fin[c * 3 + r]) sym = false;
  ok(sym, "demo square is symmetric");
  ok(rows.every((w) => pool3.has(w)), "demo rows are real pool words");

  let mono = true, cleanRows = true;
  for (let f = 0; f < FRAMES.length; f++) {
    if (f > 0) for (let i = 0; i < 9; i++) if (FRAMES[f - 1][i] && FRAMES[f][i] !== FRAMES[f - 1][i]) mono = false;
    for (let r = 0; r < 3; r++) {
      const w = FRAMES[f].slice(r * 3, r * 3 + 3);
      if (w.every((x) => x) && w.join("") !== DEMO_SQUARE[r]) cleanRows = false;
    }
  }
  ok(mono, "each frame only adds letters (monotonic)");
  ok(cleanRows, "no frame completes an unintended row word");
  ok(GIVEN.every((i) => FRAMES[0][i]), "given cells present from the first frame");
}

section("Hint erasability");
{
  const g = mount({ difficulty: "medium" });
  const [hk] = [...g.hint.keys()];
  const [hr, hc] = hk.split(",").map(Number);
  ok(g.grid[hr][hc] === g.hint.get(hk), "hint letter present at start");
  g.selR = hr; g.selC = hc; key("Backspace");
  ok(g.grid[hr][hc] === "", "hint can be erased");
  // Clear restores the scaffold hint.
  g._clear();
  ok(g.grid[hr][hc] === g.hint.get(hk), "Clear restores the hint");
}

current?.destroy();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
