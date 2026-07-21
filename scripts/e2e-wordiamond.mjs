// Headless end-to-end test of the Wordiamond controller driven through jsdom.
//
//   node scripts/e2e-wordiamond.mjs
//
// verify-wordiamond.mjs proves the ring maths; this proves the thing a player
// touches, on all three boards. The invariants are the ones whose failure
// looks like a broken game rather than a wrong answer: a board that will not
// deal, a rotation that loses a letter, an arrow wired to the wrong side, a
// lock that fails to pin its neighbours, an undo that does not undo, and — the
// one that actually bit during design — a completed ring that never announces
// itself as a win.

import { JSDOM } from "jsdom";

const dom = new JSDOM(`<!DOCTYPE html><body><div id="app"></div></body>`, {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const { window } = dom;
for (const k of [
  "window", "document", "localStorage",
  "requestAnimationFrame", "cancelAnimationFrame", "HTMLElement", "Node", "SVGElement",
]) {
  globalThis[k] = window[k];
}

const { WordiamondGame } = await import("../src/games/wordiamond/game.js");
const data = await import("../src/data/wordiamondPuzzles.js");
const { MODES, boardFor } = await import("../src/games/wordiamond/shapes.js");
const { readSide, freeSlotsFor, rotateSlots } = await import("../src/games/wordiamond/ring.js");
const { buildShareText } = await import("../src/games/wordiamond/share.js");
const { clearResults, getResult, hasPlayed } = await import("../src/games/wordiamond/results.js");
const { FRAMES, CAPTIONS } = await import("../src/games/wordiamond/tutorial.js");

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.log(`  ✗ ${msg}`); }
};
const section = (name) => console.log(`\n${name}:`);

const host = () => document.getElementById("app");

// The picker runs a looping demo, so every instance MUST be destroyed. jsdom
// keeps the process alive while any timer is pending, so an abandoned game
// hangs this script after it reports rather than failing it — which is far
// worse than a failure, because `npm test` never returns.
let current = null;
const mount = (opts = {}) => {
  current?.destroy();
  host().innerHTML = "";
  current = new WordiamondGame(host(), data, { day: "2026-07-21", ...opts });
  return current;
};

// Every mode-level test below deals a fresh board, so results must not leak
// between them — a stored win would make the next mount show a result screen.
const fresh = (opts = {}) => { clearResults(); return mount(opts); };

/** Shortest route to any valid ring, as a list of moves. */
function solvePath(g) {
  const free = freeSlotsFor(g.board, new Set([g.given]));
  const done = (c) => g.board.sides.every((_, i) => g.words.has(readSide(g.board, c, i)));
  const seen = new Map([[g.cells.join(""), null]]);
  const queue = [g.cells];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    if (done(cur)) {
      const moves = [];
      let key = cur.join("");
      while (seen.get(key)) {
        const { from, side, steps } = seen.get(key);
        moves.unshift({ side, steps });
        key = from;
      }
      return moves;
    }
    for (let si = 0; si < g.board.n; si++) {
      const slots = free[si];
      if (slots.length < 2) continue;
      for (let step = 1; step < slots.length; step++) {
        const next = rotateSlots(cur, slots, step);
        const key = next.join("");
        if (seen.has(key)) continue;
        seen.set(key, { from: cur.join(""), side: si, steps: step });
        queue.push(next);
      }
    }
  }
  return null;
}

// ── the picker ─────────────────────────────────────────────────────────────
section("difficulty picker");
let game = fresh();
const cards = [...host().querySelectorAll("[data-mode]")];
ok(cards.length === MODES.length, `${MODES.length} difficulties offered`);
ok(cards.every((c) => c.querySelector("svg polygon")),
  "each option draws the shape it actually plays on");
cards[1].click();
ok(game.mode?.id === "medium", "clicking an option starts that mode");
ok(host().querySelector(".wd-board"), "and the board appears");
game.destroy();

// ── the picker demo ────────────────────────────────────────────────────────
// Locking is the technique that makes the game solvable, so the demo is the
// only place most players will ever learn it exists.
section("picker demo");
{
  clearResults();
  const g = mount();
  const demo = host().querySelector(".wd-demo");
  ok(demo !== null, "the demo mounts on the picker");
  ok(demo.getAttribute("aria-hidden") === "true",
    "and is hidden from screen readers — the rules carry the same information");
  ok(demo.querySelectorAll(".wd-demo-tile").length === 5,
    "five tiles: a row and a column sharing their corner");
  ok(demo.querySelector(".wd-demo-lock") !== null, "with a lock to demonstrate");

  // An explanation has to arrive before the choice it explains.
  const picker = host().querySelector(".wd-picker");
  const kids = [...picker.children];
  const demoAt = kids.findIndex((n) => n.contains(demo) || n === demo);
  const listAt = kids.findIndex((n) => n.classList.contains("wd-modes"));
  ok(demoAt >= 0 && listAt >= 0 && demoAt < listAt,
    "and sits above the difficulty list, not below it");

  // The lesson only works if the words behave as claimed. A stray valid word
  // in an intermediate frame would light green and teach the wrong thing.
  const flat = data.WORDS[3];
  const w3 = new Set();
  for (let i = 0; i < flat.length; i += 3) w3.add(flat.slice(i, i + 3));
  const rowOf = (c) => c[0] + c[1] + c[2];
  const colOf = (c) => c[0] + c[3] + c[4];
  ok(!w3.has(rowOf(FRAMES[0].cells)) && !w3.has(colOf(FRAMES[0].cells)),
    "the demo starts with neither side reading a word");
  ok(w3.has(rowOf(FRAMES[1].cells)) && !w3.has(colOf(FRAMES[1].cells)),
    "rotating the row makes exactly one word");
  ok(!FRAMES[1].locked && FRAMES[2].locked, "which is then locked");
  ok(w3.has(rowOf(FRAMES[3].cells)) && w3.has(colOf(FRAMES[3].cells)),
    "and the locked corner lets the column finish without breaking it");
  ok(rowOf(FRAMES[2].cells) === rowOf(FRAMES[3].cells),
    "the locked row is untouched by the column's turn");
  ok(FRAMES.every((f) => f.cells.length === 5), "every frame describes all five cells");
  ok(CAPTIONS.length === FRAMES.length, "every frame has a caption");
  // Same letters throughout: the demo rotates, it does not swap in new ones.
  const letters = (f) => [...f.cells].sort().join("");
  ok(FRAMES.every((f) => letters(f) === letters(FRAMES[0])),
    "and every frame is a rearrangement of the same five letters");

  g.start("easy");
  ok(host().querySelector(".wd-demo") === null, "the demo is torn down on entering a mode");
  g.destroy();
  clearResults();
}

// ── every mode, end to end ─────────────────────────────────────────────────
for (const mode of MODES) {
  const board = boardFor(mode);
  section(`${mode.label} — ${board.label.toLowerCase()}, ${mode.sideLen}-letter words`);

  game = fresh({ mode: mode.id });
  ok(game.tiles.length === board.cellCount, `${board.cellCount} tiles on the ring`);
  ok(game.lockBtns.length === board.n, `${board.n} lock toggles`);
  ok(game.arrowBtns.length === board.n * 2, `${board.n * 2} nudge buttons, two per side`);
  ok(!game.won, "the board does not start solved");
  ok(game.locked.has(game.given), "the given side starts locked");
  ok(readSide(board, game.cells, game.given) === game.solution[game.given],
    "the given word survived the scramble intact");
  ok(game.el.verdict.hidden, "no verdict before a win");
  ok(!host().textContent.toLowerCase().includes("par"), "the UI never mentions par");

  // determinism
  const dealt = game.cells.join("");
  ok(fresh({ mode: mode.id }).cells.join("") === dealt, "the same day deals the same board");
  const other = fresh({ mode: mode.id, day: "2026-08-02" });
  ok(other.cells.join("") !== dealt || other.puzzleIndex !== game.puzzleIndex,
    "a different day deals a different board");

  // rotation conserves letters, and leaves the given word alone
  game = fresh({ mode: mode.id });
  const sorted = [...game.cells].sort().join("");
  const spin = board.sides.map((_, i) => i).find((i) => i !== game.given);
  game._rotate(spin, 1);
  ok([...game.cells].sort().join("") === sorted, "a rotation permutes letters, never loses one");
  ok(game.cells.every(Boolean), "no cell is emptied");
  ok(readSide(board, game.cells, game.given) === game.solution[game.given],
    "rotating a neighbour leaves the given word intact");

  // undo
  const pristine = fresh({ mode: mode.id });
  const start = pristine.cells.join("");
  const a = board.sides.map((_, i) => i).find((i) => i !== pristine.given);
  const b = board.sides.map((_, i) => i).filter((i) => i !== pristine.given)[1] ?? a;
  pristine._rotate(a, 1);
  pristine._rotate(b, 1);
  pristine._undo();
  pristine._undo();
  ok(pristine.cells.join("") === start, "undoing every move restores the deal exactly");
  ok(pristine.moves === 0, "and the move counter returns to zero");

  // the arrows move letters the way their chevron points
  game = fresh({ mode: mode.id });
  const idx = game.arrowSpecs.findIndex((s) => s.side === spin && s.end === "start");
  const run = freeSlotsFor(board, game.locked)[spin];
  const wasFirst = game.cells[run[0]];
  const beforeArrow = game.cells.join("");
  game.arrowBtns[idx].click();
  ok(game.cells[run[1]] === wasFirst, "the forward arrow moves letters the way it points");
  game.arrowBtns[idx + 1].click();
  ok(game.cells.join("") === beforeArrow, "its opposite arrow puts the side back");

  // locking pins a side and narrows its neighbours
  game = fresh({ mode: mode.id });
  const route = solvePath(game);
  ok(route !== null, "a solution is reachable from the deal");
  route.slice(0, -1).forEach(({ side, steps }) => game._rotate(side, steps));
  const lockable = board.sides
    .map((_, i) => i)
    .find((i) => i !== game.given && game.words.has(readSide(board, game.cells, i)));
  if (lockable !== undefined) {
    game._toggleLock(lockable);
    ok(game.locked.has(lockable), "a side reading a real word can be locked");
    const free = freeSlotsFor(board, game.locked);
    ok(free[lockable].length === 0, "a locked side cannot rotate");
    ok(game.arrowSpecs.filter((s) => s.side === lockable)
      .every((_, k) => game.arrowBtns[game.arrowSpecs.findIndex((s) => s.side === lockable) + k].disabled),
      "and its arrows are disabled");
    game._toggleLock(lockable);
    ok(!game.locked.has(lockable), "it can be unlocked again");
  }
  const notWord = board.sides.map((_, i) => i)
    .find((i) => i !== game.given && !game.words.has(readSide(board, game.cells, i)));
  if (notWord !== undefined) {
    game._toggleLock(notWord);
    ok(!game.locked.has(notWord), "a side that isn't a word cannot be locked");
  }

  // winning is announced
  game = fresh({ mode: mode.id });
  solvePath(game).forEach(({ side, steps }) => game._rotate(side, steps));
  ok(game.won, "walking the shortest route wins");
  ok(board.sides.every((_, i) => game.words.has(readSide(board, game.cells, i))),
    "every side reads a real word");
  ok(!game.el.verdict.hidden, "the win is announced next to the board");
  ok(board.sides.every((_, i) => game.el.verdict.textContent
        .toLowerCase().includes(readSide(board, game.cells, i))),
    "the result leads with the words you found");
  // Nothing in the result may grade the solve: no par, and no move count
  // either — a number to fall short of is exactly what we removed.
  ok(!/\bpar\b|\bmoves?\b|\d+\s*moves?/i.test(game.el.verdict.textContent),
    "the result never counts your moves at you");
  // No commentary on the solve at all — not a grade, and not a consolation
  // either. Just the ring and how many exist.
  ok(!/solved|counts the same|came from|well done|nice/i.test(game.el.verdict.textContent),
    "and it passes no comment on how you got there");
  // The rail keeps its live move counter — that is a readout while you play.
  // The rule is only that the RESULT never turns it into a grade.
  ok(/moves/i.test(game.el.mode.closest(".wd-rail").textContent),
    "the rail still shows moves as live information");
  ok(game.el.board.classList.contains("is-won"), "the board carries the won state");
  ok(!game.el.share.disabled, "the result becomes shareable only after the win");
  // The share must never leak the answer: everyone plays the same daily board,
  // so pasting the ring into a chat solves it for whoever has not played.
  const shared = buildShareText({ modeLabel: mode.label, day: "2026-07-21", moves: game.moves });
  const solutionWords = board.sides.map((_, i) => readSide(board, game.cells, i));
  ok(solutionWords.every((w) => !shared.toLowerCase().includes(w)),
    "and the share text contains none of the words");
  ok(/Moves: \d+/.test(shared), "but it does carry the move count");
  ok(game.arrowBtns.every((btn) => btn.disabled), "the nudge buttons go inert");
  ok(game.el.message.textContent === "", "no warning left over on the win screen");
}

// ── a frozen day file wins over the bundled pool ───────────────────────────
// The point of the archive: the board a player sees is the one that was
// committed, not whatever the current generator would now produce.
section("frozen daily boards");
{
  const mode = MODES[1];
  const board = boardFor(mode);
  const derived = fresh({ mode: mode.id });
  const pool = data.POOLS[mode.id];
  // A deliberately different puzzle from the one today's seed would pick.
  const other = pool.find(([w]) => w !== derived.solution.join(" "));
  const frozenCells = [...derived.cells].reverse().join("");
  host().innerHTML = "";
  const frozen = new WordiamondGame(host(), {
    ...data,
    day: {
      date: "2026-07-21", v: 1,
      modes: { [mode.id]: { words: other[0], given: other[1], rings: other[2], cells: frozenCells } },
    },
  }, { mode: mode.id, day: "2026-07-21" });

  ok(frozen.solution.join(" ") === other[0], "the day file's puzzle overrides the seeded pick");
  ok(frozen.cells.join("") === frozenCells, "and its exact arrangement is dealt verbatim");
  ok(frozen.cells.length === board.cellCount, "with the right number of cells");
  frozen.destroy();

  host().innerHTML = "";
  const fallback = new WordiamondGame(host(), { ...data, day: null }, {
    mode: mode.id, day: "2026-07-21",
  });
  ok(fallback.cells.join("") === derived.cells.join(""),
    "and with no file at all the board falls back to the identical seeded deal");
  fallback.destroy();
}

// ── a released drag settles without replaying itself ───────────────────────
// The drag already showed the letters moving. Animating again on release
// replays a motion the player just watched, which reads as the board undoing
// and redoing the move.
section("drag settling");
{
  clearResults();
  const g = mount({ mode: "medium" });
  const spin = g.board.sides.map((_, i) => i).find((i) => i !== g.given);
  const slots = freeSlotsFor(g.board, g.locked)[spin];
  const tile = g.tiles[slots[0]];
  const dir = g.board.sides[spin].dir;
  const step = g._stepAlong(slots);
  const ev = (x, y) => ({ target: tile, clientX: x, clientY: y, pointerId: 1 });

  g._onPointerDown(ev(0, 0));
  g._onPointerMove(ev(dir.x * step, dir.y * step));
  ok(g.drag?.side === spin, "the drag picked up the side being dragged");
  ok(slots.every((sl) => g.tiles[sl].classList.contains("is-moving")),
    "and its tiles follow the pointer");
  g._endDrag(ev(dir.x * step, dir.y * step));

  ok(g.tiles.every((t) => !t.classList.contains("is-anim")),
    "no tile is left animating after the drag is released");
  ok(g.moves === 1, "and the move still counted");

  // Every other route has no preview, so those still animate.
  const before = g.moves;
  g._rotate(spin, 1);
  ok(g.tiles.some((t) => t.classList.contains("is-anim")),
    "a button or keyboard move still animates, having shown no preview");
  ok(g.moves === before + 1, "and counts too");
  g.destroy();
  clearResults();
}

// ── a finished board is not dealt twice ────────────────────────────────────
// The point of a daily: once today's board is solved, re-entering that mode
// shows what you did rather than handing you the same puzzle again.
section("finished boards");
{
  clearResults();
  const mode = MODES[0];
  const board = boardFor(mode);
  let g = mount({ mode: mode.id });
  ok(!hasPlayed(mode.id), "nothing is recorded before the win");

  solvePath(g).forEach(({ side, steps }) => g._rotate(side, steps));
  const moves = g.moves;
  const stored = getResult(mode.id);
  ok(stored !== null, "winning records the result");
  ok(stored.moves === moves, "with the move count it actually took");
  ok(stored.ring.join(" ") ===
     board.sides.map((_, i) => readSide(board, g.cells, i)).join(" "),
    "and the ring the player landed on");
  ok(g.el.restart.disabled, "restart is spent once the day is recorded");

  // Extra paints must not overwrite the stored count.
  g._paint();
  g._paint();
  ok(getResult(mode.id).moves === moves, "repainting does not rewrite the result");

  g.destroy();
  g = mount({ mode: mode.id });
  ok(!host().querySelector(".wd-board"), "re-entering that mode deals no board");
  ok(host().querySelector(".wd-done"), "it shows the stored result instead");
  ok(host().textContent.includes(String(moves)), "including the move count");
  ok(stored.ring.every((w) => host().textContent.toLowerCase().includes(w)),
    "and the ring that was found");
  ok(g.el.share && !g.el.share.disabled, "the result stays shareable");
  ok(/Moves: /.test(buildShareText({ modeLabel: mode.label, day: "2026-07-21", moves: g.moves })),
    "and the share still carries a move count from this screen");

  g.el.modes.click();
  const done = [...host().querySelectorAll(".wd-mode")].filter((b) => b.classList.contains("is-done"));
  ok(done.length === 1, "the picker marks exactly the mode that was played");
  ok(done[0].textContent.includes("Solved"), "and says so on the card");
  ok([...host().querySelectorAll(".wd-mode")].filter((b) => !b.classList.contains("is-done")).length
     === MODES.length - 1, "the other difficulties are still open");

  // Yesterday's results must not count as today's.
  ok(hasPlayed(mode.id), "the result is live for today");
  const raw = JSON.parse(localStorage.getItem("aintaword2:wordiamond:daily"));
  raw.date = "2020-01-01";
  localStorage.setItem("aintaword2:wordiamond:daily", JSON.stringify(raw));
  ok(!hasPlayed(mode.id), "but a stale day self-prunes to empty");
  clearResults();
}

// ── back to the picker, and teardown ───────────────────────────────────────
section("navigation");
game = mount({ mode: "hard" });
game.el.modes.click();
ok(host().querySelectorAll("[data-mode]").length === MODES.length,
  "\"Change difficulty\" returns to the picker");
game.destroy();
ok(host().innerHTML === "", "destroy() empties the container");

// Anything still holding a timer would keep node alive past the report.
current?.destroy();
current = null;

console.log("");
if (fail) {
  console.log(`❌ ${pass} passed, ${fail} failed`);
  process.exit(1);
}
console.log(`✅ ${pass} passed, 0 failed`);
