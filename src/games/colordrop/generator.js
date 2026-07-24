// colordrop board generator.
//
// Contract (DESIGN.md): lay the walls first, ENUMERATE every lane's recipe,
// then pick the goal from the reachable leaf colors — never independently.
// This is the structural fix for the pitch's "unreachable Purple" bug: a goal
// can only be a color some lane actually produces, and we require it to be
// produced by exactly ONE lane so there's a single correct drop.
//
// Same shape as colorpath/generator.js, which likewise chooses its goal only
// after the solution structure exists.

import { Rng } from "../../core/rng.js";
import {
  PRIMARIES, SECONDARIES, WHITE, nodeCount, enumerateLanes, laneRecipe,
} from "./board.js";

// Per-tier knobs. Each tier adds one new demand over the last:
//   easy → medium: a ROW (depth 2→3, 4→8 lanes) AND minus gates (subtraction
//                  in play, so lanes can't be read by union alone).
//   medium → hard: SECONDARY gates — a gate can add/subtract two primaries at
//                  once (+Orange, −Purple), which sharply raises the mixing load.
//
// Structural facts, all found by measurement (scripts/measure-colordrop.mjs):
//   • At depth 2 a live subtraction can only cancel back to White, so minus
//     gates only get interesting at depth 3 — hence medium is where they enter.
//   • Secondary gates ADDS-ONLY collapse to brown (a secondary is +2 bits, so
//     lanes saturate: ~5/8 brown, ~44% unsolvable). They only stay well-formed
//     WITH minus gates (which let a lane climb back down) — so hard carries both.
//   • requireSubInPlay guarantees at least one lane's subtraction is live, so a
//     negatives tier can never degenerate into an adds-only board by luck.
export const TIERS = {
  easy:   { depth: 2, negProb: 0.0,  alphabet: PRIMARIES },
  medium: { depth: 3, negProb: 0.4,  alphabet: PRIMARIES, requireSubInPlay: true },
  hard:   { depth: 3, negProb: 0.4,  alphabet: [...PRIMARIES, ...SECONDARIES], requireSubInPlay: true },
};

// Reject boards that are too samey to be interesting: a board where nearly
// every lane lands on the same color is a giveaway. Require a spread.
const MIN_DISTINCT_COLORS = 3;

function pickOp(rng, alphabet, negProb) {
  const bit = alphabet[rng.int(0, alphabet.length - 1)];
  const sign = rng.float() < negProb ? -1 : 1;
  return { bit, sign };
}

// Does this lane's recipe actually exercise a subtraction that changes the
// color? A "-Blue" on a lane that never held blue is a no-op; a board whose
// only negatives are dead weight isn't really testing the mechanic. We use
// this to PREFER meaningful goals, not to forbid dead ops (recognising a no-op
// is fair difficulty — it just shouldn't be the whole puzzle).
function laneUsesLiveSubtraction(board, lane) {
  const { ops, colors } = laneRecipe(board, lane);
  return ops.some((op, i) => op.sign < 0 && colors[i] !== colors[i + 1]);
}

/**
 * Build one candidate board, or null if it doesn't clear the quality gates.
 * Callers retry with a fresh rng draw (see generateBoard).
 */
function tryBuild(rng, tier) {
  const cfg = TIERS[tier];
  if (!cfg) throw new Error(`unknown tier: ${tier}`);

  const nodes = [];
  for (let i = 0; i < nodeCount(cfg.depth); i++) {
    nodes.push({
      left: pickOp(rng, cfg.alphabet, cfg.negProb),
      right: pickOp(rng, cfg.alphabet, cfg.negProb),
    });
  }
  const board = { depth: cfg.depth, nodes, tier, goal: WHITE, solutionLane: -1 };

  const lanes = enumerateLanes(board);

  // Tally which lanes produce each color; a goal must be produced by exactly
  // one lane so the answer is unique.
  const byColor = new Map();
  for (const l of lanes) {
    if (!byColor.has(l.color)) byColor.set(l.color, []);
    byColor.get(l.color).push(l.lane);
  }
  if (byColor.size < MIN_DISTINCT_COLORS) return null;

  // A goal must be produced by exactly one lane, and WHITE is never a goal:
  // it's the ball's start color, and "reach blank" is both a weird target and
  // the trivial escape hatch that let depth-2 negatives dodge real mixing.
  let pool = [...byColor.entries()]
    .filter(([color, ls]) => ls.length === 1 && color !== WHITE);
  if (pool.length === 0) return null;

  // On the subtraction tier at least one lane must carry a *live* subtraction,
  // so negatives are real decoys the player has to compute rather than dead
  // no-ops. The answer itself may be a union lane — that's what preserves the
  // full goal palette (forcing the answer to subtract collapses it to primaries).
  if (cfg.requireSubInPlay) {
    const inPlay = lanes.some((l) => laneUsesLiveSubtraction(board, l.lane));
    if (!inPlay) return null;
  }

  const [goal, [solutionLane]] = pool[rng.int(0, pool.length - 1)];
  board.goal = goal;
  board.solutionLane = solutionLane;
  return board;
}

/**
 * Generate one valid, uniquely-solvable board for a tier from a seed.
 * Deterministic in (seed, tier). Throws only if the gates can't be met in
 * `attempts` draws, which shouldn't happen for the shipped tiers.
 */
export function generateBoard(seed, tier, attempts = 400) {
  const rng = new Rng(`colordrop:${tier}:${seed}`);
  for (let i = 0; i < attempts; i++) {
    const board = tryBuild(rng, tier);
    if (board) return board;
  }
  throw new Error(`colordrop: no valid ${tier} board after ${attempts} attempts`);
}

/**
 * A daily set: N distinct boards for a tier. Distinct by (goal, solutionLane)
 * so the same day never serves two puzzles that feel identical.
 */
export function generateDailySet(seed, tier, count) {
  const boards = [];
  const seen = new Set();
  let salt = 0;
  while (boards.length < count && salt < count * 50) {
    const board = generateBoard(`${seed}:${salt++}`, tier);
    const key = `${board.goal}:${board.solutionLane}:${board.depth}`;
    if (seen.has(key)) continue;
    seen.add(key);
    boards.push(board);
  }
  if (boards.length < count) {
    throw new Error(`colordrop: only built ${boards.length}/${count} ${tier} boards`);
  }
  return boards;
}
