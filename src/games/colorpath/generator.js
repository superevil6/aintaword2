// Puzzle generator for Color Path.
//
// Produces a valid NxN grid of colors plus K scattered target cells.
//
// Color layout guarantees:
//   1. grid[0] = WHITE (start)
//   2. No two orthogonally adjacent cells share the same color
//   3. At least one valid path exists from start through all targets
//      (the color walk ensures connectivity; targets are chosen from
//       reachable non-start cells)
//
// Returns { colors, targets } where targets is an array of cell indices
// the player must visit to win.

import { WHITE, COLOR_COUNT } from "./colors.js";
const PRIMARY_BITS = [1, 2, 4];

export const VALID_TARGETS = [3, 5, 6]; // ORANGE, PURPLE, GREEN (even parity)

/**
 * @param {number} size        - Grid side length
 * @param {number} targetCount - Number of target circles to place
 * @param {object} rng         - Rng instance
 * @returns {{ colors: number[], targets: number[], obstacles: number[] }}
 */
export function generateGrid(size, targetCount, rng) {
  const goalColor = VALID_TARGETS[rng.int(0, VALID_TARGETS.length - 1)];
  const gridPath  = buildMinimalPath(size, rng);
  const colorPath = buildColorWalk(WHITE, goalColor, gridPath.length - 1, rng);

  const colors = new Array(size * size).fill(-1);
  for (let i = 0; i < gridPath.length; i++) {
    colors[gridPath[i]] = colorPath[i];
  }

  // Ensure the first two moves are always primary colors (for path divergence).
  // Colors at index 1 (right of start) and size (below start) must be RED, YELLOW, or BLUE.
  const PRIMARY_COLORS = [1, 2, 4]; // RED, YELLOW, BLUE
  const rightIdx = 1;
  const downIdx = size;

  // Helper to find an available primary color for a cell
  function pickPrimaryColor(idx) {
    const used = new Set(
      orthogonalNeighbors(idx, size).map(n => colors[n]).filter(c => c !== -1),
    );
    const available = PRIMARY_COLORS.filter(c => !used.has(c));
    return available.length > 0 ? rng.pick(available) : PRIMARY_COLORS[0];
  }

  // Set right neighbor (if not already set by the path or if it's white)
  if (colors[rightIdx] === -1 || colors[rightIdx] === WHITE) {
    colors[rightIdx] = pickPrimaryColor(rightIdx);
  }

  // Set down neighbor (if not already set by the path or if it's white), prefer different from right
  if (colors[downIdx] === -1 || colors[downIdx] === WHITE) {
    let chosen = pickPrimaryColor(downIdx);
    // Try to diverge from the right neighbor for better variety
    const alternatives = PRIMARY_COLORS.filter(c => c !== colors[rightIdx] && !new Set(
      orthogonalNeighbors(downIdx, size).map(n => colors[n]).filter(c => c !== -1),
    ).has(c));
    if (alternatives.length > 0) {
      chosen = rng.pick(alternatives);
    }
    colors[downIdx] = chosen;
  }

  // Greedy fill — avoid direct neighbors only.
  // With 8 colors and at most 4 neighbors, there are always ≥ 4 safe choices.
  // Ambiguity (two same-colored neighbors sharing a cell) can still arise due
  // to repeated colors in the path walk; the UI handles that case gracefully
  // by highlighting all valid targets and letting the player tap one.
  for (let idx = 0; idx < size * size; idx++) {
    if (colors[idx] !== -1) continue;
    const used = new Set(
      orthogonalNeighbors(idx, size).map(n => colors[n]).filter(c => c !== -1),
    );
    const available = [];
    for (let c = 0; c < COLOR_COUNT; c++) {
      if (!used.has(c)) available.push(c);
    }
    colors[idx] = rng.pick(available);
  }

  // Pick 3 targets - fixed to actual corner positions
  const targets = [];
  
  // For a 7x7 grid:
  // Top-right: index 6 (row 0, col 6)
  // Bottom-left: index 42 (row 6, col 0)
  // Bottom-right: index 48 (row 6, col 6)
  
  const topRightIdx = 6;
  const bottomLeftIdx = (size - 1) * size; // First cell of last row
  const bottomRightIdx = size * size - 1; // Last cell
  
  // Always add bottom-right
  targets.push(bottomRightIdx);
  
  // Add top-right if on path, otherwise find closest in top-right area
  if (gridPath.includes(topRightIdx)) {
    targets.push(topRightIdx);
  } else {
    // Find the rightmost cell in the top half
    let best = null;
    for (const idx of gridPath) {
      const row = Math.floor(idx / size);
      if (row < Math.floor(size / 2)) {
        if (best === null || (idx % size) > (best % size)) {
          best = idx;
        }
      }
    }
    if (best !== null) targets.push(best);
  }
  
  // Add bottom-left if on path, otherwise find closest in bottom-left area
  if (gridPath.includes(bottomLeftIdx)) {
    targets.push(bottomLeftIdx);
  } else {
    // Find the leftmost cell in the bottom half
    let best = null;
    for (const idx of gridPath) {
      const row = Math.floor(idx / size);
      if (row >= Math.floor(size / 2)) {
        if (best === null || (idx % size) < (best % size)) {
          best = idx;
        }
      }
    }
    if (best !== null && !targets.includes(best)) targets.push(best);
  }
  
  // Ensure we have exactly 3
  while (targets.length < 3) {
    const candidate = gridPath[Math.floor(rng.float() * gridPath.length)];
    if (!targets.includes(candidate)) {
      targets.push(candidate);
    }
  }

  // Create obstacles
  const pathSet = new Set(gridPath);
  const targetSet = new Set(targets);
  const obstacles = [];
  
  // Simple wall across center row only
  const centerRow = Math.floor(size / 2);
  for (let col = 0; col < size; col++) {
    const idx = centerRow * size + col;
    // Leave 2-3 random openings (just pick 2-3 columns to keep clear)
    if (Math.random() > 0.4 && !pathSet.has(idx) && !targetSet.has(idx)) {
      obstacles.push(idx);
    }
  }

  return { colors, targets, obstacles };
}

// ── Internal helpers ──────────────────────────────────────────────────────

/**
 * Random right/down-only path from (0,0) to (N-1,N-1).
 * Produces exactly 2*(N-1) steps; no two non-consecutive cells are adjacent.
 */
function buildMinimalPath(size, rng) {
  // N-1 rights (0) and N-1 downs (1), Fisher-Yates shuffled
  const steps = [];
  for (let i = 0; i < size - 1; i++) {
    steps.push(0); // right
    steps.push(1); // down
  }
  for (let i = steps.length - 1; i > 0; i--) {
    const j = Math.floor(rng.float() * (i + 1));
    [steps[i], steps[j]] = [steps[j], steps[i]];
  }

  const path = [0];
  let row = 0, col = 0;
  for (const step of steps) {
    if (step === 0) col++;
    else row++;
    path.push(row * size + col);
  }
  return path;
}

/**
 * Find a random walk on the RYB hypercube from `start` to `target`
 * in exactly `length` steps.
 *
 * Uses forward BFS to build reachability sets, then traces back a
 * random valid path.  State space: 8 colors × ~30 steps = trivial.
 */
function buildColorWalk(start, target, length, rng) {
  // reachable[step] = Set of colors reachable from `start` in exactly `step` flips
  const reachable = [new Set([start])];
  for (let step = 1; step <= length; step++) {
    const next = new Set();
    for (const color of reachable[step - 1]) {
      for (const bit of PRIMARY_BITS) {
        const c = color ^ bit;
        if (c < COLOR_COUNT) next.add(c); // exclude Brown (≥ COLOR_COUNT)
      }
    }
    reachable.push(next);
  }

  if (!reachable[length].has(target)) {
    throw new Error(
      `colorpath/generator: cannot reach color ${target} from ${start} in ${length} steps`
    );
  }

  // Trace back a uniformly random valid path
  const path = new Array(length + 1);
  path[length] = target;

  for (let step = length - 1; step >= 0; step--) {
    const candidates = [];
    for (const color of reachable[step]) {
      if (PRIMARY_BITS.some(bit => (color ^ bit) === path[step + 1])) {
        candidates.push(color);
      }
    }
    path[step] = rng.pick(candidates);
  }

  return path;
}

function orthogonalNeighbors(idx, size) {
  const r = Math.floor(idx / size);
  const c = idx % size;
  const out = [];
  if (r > 0)          out.push((r - 1) * size + c);
  if (r < size - 1)   out.push((r + 1) * size + c);
  if (c > 0)          out.push(r * size + (c - 1));
  if (c < size - 1)   out.push(r * size + (c + 1));
  return out;
}
