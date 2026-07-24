// Verifier for colordrop — the shipping gate.
//
//   node scripts/verify-colordrop.mjs
//
// Asserts the daily boards every player will get are sound: each board is
// UNIQUELY solvable, its recorded solutionLane really lands the goal, sets hold
// distinct boards, and the scoring formula behaves. Mirrors the other games'
// verify-* gates; runs over a wide day range so a bad seed can't slip through.

import {
  laneRecipe, solve, isUniquelySolvable, laneCount, WHITE,
} from "../src/games/colordrop/board.js";
import { generateDailySet, TIERS } from "../src/games/colordrop/generator.js";
import { DIFFICULTIES, DIFFICULTY_ORDER } from "../src/games/colordrop/difficulty.js";
import { dailySeedFor } from "../src/games/colordrop/results.js";
import { scoreDrop, BASE, FLOOR, PENALTY } from "../src/games/colordrop/scoring.js";

const DAYS = 200;
const FROM = "2026-07-23";

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) pass++;
  else { fail++; console.log(`  ✗ ${msg}`); }
};

function dayKey(from, offset) {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

// ── daily boards ────────────────────────────────────────────────────────────
console.log(`Verifying ${DAYS} days × ${DIFFICULTY_ORDER.length} tiers…`);
for (let i = 0; i < DAYS; i++) {
  const day = dayKey(FROM, i);
  for (const id of DIFFICULTY_ORDER) {
    const count = DIFFICULTIES[id].boards;
    const set = generateDailySet(dailySeedFor(id, day), id, count);
    ok(set.length === count, `${day} ${id}: expected ${count} boards, got ${set.length}`);

    const keys = new Set();
    for (const board of set) {
      const sols = solve(board);
      ok(sols.length === 1, `${day} ${id}: board has ${sols.length} solutions, want 1`);
      ok(isUniquelySolvable(board), `${day} ${id}: not uniquely solvable`);
      ok(sols[0] === board.solutionLane, `${day} ${id}: solutionLane ${board.solutionLane} ≠ solved ${sols[0]}`);
      ok(laneRecipe(board, board.solutionLane).color === board.goal,
        `${day} ${id}: solution lane does not land the goal`);
      ok(board.goal !== WHITE, `${day} ${id}: goal is WHITE (never allowed)`);
      ok(board.solutionLane >= 0 && board.solutionLane < laneCount(board.depth),
        `${day} ${id}: solutionLane out of range`);
      keys.add(`${board.goal}:${board.solutionLane}:${board.depth}`);
    }
    ok(keys.size === set.length, `${day} ${id}: set has duplicate boards`);
  }
}

// ── determinism ──────────────────────────────────────────────────────────────
for (const id of DIFFICULTY_ORDER) {
  const a = JSON.stringify(generateDailySet(dailySeedFor(id, FROM), id, DIFFICULTIES[id].boards));
  const b = JSON.stringify(generateDailySet(dailySeedFor(id, FROM), id, DIFFICULTIES[id].boards));
  ok(a === b, `${id}: daily set not deterministic`);
}

// ── tier ladder invariants ───────────────────────────────────────────────────
ok(TIERS.easy.depth === 2 && TIERS.easy.negProb === 0, "easy: 2 rows, adds-only");
ok(TIERS.medium.depth === 3 && TIERS.medium.negProb > 0, "medium: 3 rows, minus gates");
ok(TIERS.hard.depth === 3 && TIERS.hard.negProb > 0, "hard: 3 rows, minus gates");
ok(TIERS.hard.alphabet.some((b) => [3, 5, 6].includes(b)), "hard: secondary gates in play");
ok(TIERS.easy.alphabet.every((b) => [1, 2, 4].includes(b)), "easy: primaries only");

// ── scoring ──────────────────────────────────────────────────────────────────
ok(scoreDrop({ correct: true, elapsedMs: 0 }) === BASE, "instant correct = BASE");
ok(scoreDrop({ correct: true, elapsedMs: 999_999 }) === FLOOR, "slow correct = FLOOR");
ok(scoreDrop({ correct: false, elapsedMs: 0 }) === -PENALTY, "wrong = -PENALTY");
ok(scoreDrop({ correct: true, elapsedMs: 1000 }) < BASE, "reward decays with time");

console.log(`\n${fail === 0 ? "✓" : "✗"} verify-colordrop: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
