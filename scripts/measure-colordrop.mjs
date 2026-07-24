// Measure-before-shipping harness for colordrop.
//
// Generates a large sample of boards per tier and checks the design holds up:
//   1. every board is UNIQUELY solvable (the core contract)
//   2. boards aren't trivial (color spread, brown saturation, live negatives)
//   3. goal colors are reasonably varied, not stuck on one hue
//
// Run: node scripts/measure-colordrop.mjs
// This is the analogue of the word games' verify-* gates and letter-shooter's
// measure.py — it exists to catch a bad difficulty curve before any UI is built.

import {
  enumerateLanes, solve, isUniquelySolvable, laneRecipe,
  colorName, WHITE, BROWN, laneCount,
} from "../src/games/colordrop/board.js";
import { generateBoard, generateDailySet, TIERS } from "../src/games/colordrop/generator.js";

const SAMPLE = 5000;
const TIER_ORDER = ["easy", "medium", "hard"];

function pct(n, d) {
  return d ? `${((100 * n) / d).toFixed(1)}%` : "—";
}

function measureTier(tier) {
  const cfg = TIERS[tier];
  const lanes = laneCount(cfg.depth);
  const stats = {
    boards: 0,
    nonUnique: 0,
    goalHist: new Array(8).fill(0),
    distinctSum: 0,
    brownLaneSum: 0,
    solutionUsesSub: 0,
    solutionColor: new Array(8).fill(0),
  };

  for (let i = 0; i < SAMPLE; i++) {
    const board = generateBoard(`sample:${i}`, tier);
    stats.boards++;

    const sols = solve(board);
    if (sols.length !== 1) stats.nonUnique++;

    stats.goalHist[board.goal]++;
    const all = enumerateLanes(board);
    stats.distinctSum += new Set(all.map((l) => l.color)).size;
    stats.brownLaneSum += all.filter((l) => l.color === BROWN).length;

    const sol = laneRecipe(board, board.solutionLane);
    stats.solutionColor[board.goal]++;
    if (sol.ops.some((op, k) => op.sign < 0 && sol.colors[k] !== sol.colors[k + 1])) {
      stats.solutionUsesSub++;
    }
  }

  return { tier, cfg, lanes, stats };
}

function report({ tier, cfg, lanes, stats }) {
  const b = stats.boards;
  console.log(`\n── ${tier.toUpperCase()}  (depth ${cfg.depth}, ${lanes} lanes, negProb ${cfg.negProb}) ──`);
  console.log(`  boards sampled:          ${b}`);
  console.log(`  NON-unique solutions:    ${stats.nonUnique}  ${stats.nonUnique ? "‼ FAIL" : "✓"}`);
  console.log(`  avg distinct colors/board: ${(stats.distinctSum / b).toFixed(2)} / ${lanes}`);
  console.log(`  avg brown lanes/board:     ${(stats.brownLaneSum / b).toFixed(2)} / ${lanes}  (saturation)`);
  if (cfg.negProb > 0) {
    console.log(`  solution lane uses a live subtraction: ${pct(stats.solutionUsesSub, b)}`);
  }
  const goals = stats.goalHist
    .map((n, c) => [colorName(c), n])
    .filter(([, n]) => n > 0)
    .sort((x, y) => y[1] - x[1])
    .map(([name, n]) => `${name} ${pct(n, b)}`)
    .join(", ");
  console.log(`  goal distribution:       ${goals}`);
}

// Determinism spot-check: same seed → identical board.
function checkDeterminism() {
  for (const tier of TIER_ORDER) {
    const a = JSON.stringify(generateBoard("dtm", tier));
    const b = JSON.stringify(generateBoard("dtm", tier));
    if (a !== b) throw new Error(`non-deterministic generation for ${tier}`);
  }
  console.log("determinism: same seed → identical board ✓");
}

// Daily-set sanity: 5 distinct boards build cleanly and stay uniquely solvable.
function checkDailySet() {
  for (const tier of TIER_ORDER) {
    const set = generateDailySet("2026-07-23", tier, 5);
    const keys = new Set(set.map((x) => `${x.goal}:${x.solutionLane}`));
    const allUnique = set.every(isUniquelySolvable);
    console.log(
      `daily set ${tier}: ${set.length} boards, ${keys.size} distinct, ` +
      `all uniquely solvable ${allUnique ? "✓" : "‼ FAIL"}`,
    );
  }
}

console.log(`colordrop measurement — ${SAMPLE} boards/tier`);
checkDeterminism();
const results = TIER_ORDER.map(measureTier);
results.forEach(report);
console.log("");
checkDailySet();

const anyFail = results.some((r) => r.stats.nonUnique > 0);
if (anyFail) {
  console.error("\n‼ uniqueness contract violated — do not ship");
  process.exit(1);
}
console.log("\n✓ all boards uniquely solvable");
