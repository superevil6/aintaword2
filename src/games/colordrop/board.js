// colordrop board model + enumeration solver — pure, DOM-free, Node-runnable.
//
// A board is a full binary tree of two-sided walls. The ball starts WHITE at
// the top and keeps its lane as it falls: at each level it passes one side of
// one wall, applying that side's pigment op. A leaf of the tree is a drop
// LANE, and its RECIPE is the ordered ops it passes. Depth D → 2^D lanes, each
// D ops long.
//
// This module owns the *logic* only (recipes, colors, solving). Rendering and
// pip/CVD accessibility come from colorpath's colors.js at integration time;
// the 8-color RYB model is duplicated here as raw bits so the solver and the
// daily-set builder run under Node without pulling any UI code. Keeping it
// tiny and self-contained is deliberate — see DESIGN.md "reuse map".

// RYB primaries as a 3-bit mask (same layout as colorpath/colors.js).
export const RED = 1; // 001
export const YELLOW = 2; // 010
export const BLUE = 4; // 100
export const WHITE = 0; // 000
export const ORANGE = 3; // 011  R + Y
export const PURPLE = 5; // 101  R + B
export const GREEN = 6; // 110  Y + B
export const BROWN = 7; // 111
export const PRIMARIES = [RED, YELLOW, BLUE];
// Secondary gates add/subtract two primaries at once (e.g. +Orange = +Red+Yellow).
// Same OR / AND-NOT math, just a two-bit mask; used to make the hard tier harder.
export const SECONDARIES = [ORANGE, PURPLE, GREEN];

export const COLOR_NAMES = [
  "White", "Red", "Yellow", "Orange", "Blue", "Purple", "Green", "Brown",
];

export const colorName = (c) => COLOR_NAMES[c & 7];

// Apply one wall-side op to the ball's current color.
//   sign +1 → add pigment    (OR the bit)   e.g. Red|Yellow = Orange
//   sign -1 → subtract        (AND-NOT bit)  e.g. Purple & ~Blue = Red
// Subtracting a bit you don't have is a no-op — legitimate (the player must
// recognise it) but the generator avoids leaning on it (see generator.js).
export function applyOp(color, op) {
  return op.sign > 0 ? (color | op.bit) : (color & ~op.bit);
}

// A wall side rendered for humans/pips: "+Red", "-Blue".
export function opLabel(op) {
  return (op.sign > 0 ? "+" : "-") + colorName(op.bit);
}

// Number of wall nodes in a depth-D full binary tree, heap-indexed from 0.
export const nodeCount = (depth) => (1 << depth) - 1;
// Number of drop lanes (leaves).
export const laneCount = (depth) => 1 << depth;

/**
 * Fold a single lane's recipe over WHITE and return every intermediate color.
 * Lane index L is read MSB-first: bit k of L (from the top) picks left(0) or
 * right(1) at level k, walking the heap-indexed node array.
 *
 * @returns {{ ops: object[], colors: number[], color: number }}
 *   ops     — the D ops passed, top to bottom
 *   colors  — WHITE plus the color after each op (length D+1), for animation
 *   color   — the final color at the goal
 */
export function laneRecipe(board, lane) {
  const { depth, nodes } = board;
  const ops = [];
  const colors = [WHITE];
  let node = 0;
  let color = WHITE;
  for (let level = 0; level < depth; level++) {
    // MSB-first: the top level is the highest bit of the lane index.
    const goRight = (lane >> (depth - 1 - level)) & 1;
    const op = goRight ? nodes[node].right : nodes[node].left;
    color = applyOp(color, op);
    ops.push(op);
    colors.push(color);
    node = 2 * node + 1 + goRight; // descend to the chosen child
  }
  return { ops, colors, color };
}

/** Every lane's recipe, indexed by lane. */
export function enumerateLanes(board) {
  const out = [];
  for (let lane = 0; lane < laneCount(board.depth); lane++) {
    out.push({ lane, ...laneRecipe(board, lane) });
  }
  return out;
}

/**
 * Lanes whose final color equals the board's goal. A well-formed board has
 * exactly one — the generator guarantees it. Returns the array so callers
 * (verify scripts) can assert on its length rather than trust it.
 */
export function solve(board) {
  return enumerateLanes(board)
    .filter((l) => l.color === board.goal)
    .map((l) => l.lane);
}

/** Convenience: is the board solvable with a single, unique answer? */
export function isUniquelySolvable(board) {
  return solve(board).length === 1;
}
