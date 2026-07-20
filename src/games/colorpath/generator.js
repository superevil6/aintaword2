// Puzzle generator for Color Path.
//
// Produces a valid NxN grid of colors, K target cells, and scattered obstacles.
//
// Layout guarantees:
//   1. grid[0] = WHITE (start, top-left)
//   2. Every target lies on the solution path, so all are reachable
//   3. No two orthogonally adjacent cells share the same color
//   4. When targetCount >= 4, every quadrant holds at least one target;
//      below that, targets are spread across as many quadrants as there are
//      targets to place
//
// Returns { colors, targets, obstacles } where targets is an array of cell
// indices the player must visit to win.

import { WHITE, COLOR_COUNT } from "./colors.js";

const PRIMARY_BITS = [1, 2, 4];

// Goal colors grouped by popcount parity. Every step of the color walk flips
// exactly one primary bit, so a goal is only reachable in exactly L steps if
// its popcount parity matches L. The path length varies per puzzle, so the
// goal color has to be chosen after the path exists rather than before.
const GOAL_COLORS_EVEN = [3, 5, 6]; // ORANGE, PURPLE, GREEN — two bits set
const GOAL_COLORS_ODD  = [1, 2, 4]; // RED, YELLOW, BLUE     — one bit set

// Retained under the old name for any caller still importing it.
export const VALID_TARGETS = GOAL_COLORS_EVEN;

// Fraction of the grid the solution path tries to cover. Higher means a longer
// path and more room to place well-separated targets, but fewer free cells for
// obstacles to occupy.
const PATH_COVERAGE = 0.62;

// Fraction of the off-path cells made impassable.
const OBSTACLE_DENSITY = 0.12;

// How many wandering paths to try before falling back to the perimeter loop.
const PATH_ATTEMPTS = 40;

// Quadrant coverage alone still lets two targets sit either side of a quadrant
// boundary and end up adjacent. Building several candidate sets and keeping the
// most spread-out one fixes that far more cheaply than trying to encode the
// spacing as a hard constraint during selection.
const TARGET_ATTEMPTS = 12;

/**
 * @param {number} size        - Grid side length
 * @param {number} targetCount - Number of target circles to place
 * @param {object} rng         - Rng instance
 * @returns {{ colors: number[], targets: number[], obstacles: number[] }}
 */
export function generateGrid(size, targetCount, rng) {
  const gridPath  = buildPath(size, targetCount, rng);
  const steps     = gridPath.length - 1;
  const goalPool  = steps % 2 === 0 ? GOAL_COLORS_EVEN : GOAL_COLORS_ODD;
  const goalColor = rng.pick(goalPool);
  const colorPath = buildColorWalk(WHITE, goalColor, steps, rng);

  const colors = new Array(size * size).fill(-1);
  for (let i = 0; i < gridPath.length; i++) {
    colors[gridPath[i]] = colorPath[i];
  }

  // The start has two orthogonal neighbours but the path only leaves through
  // one of them. Force the other to a distinct primary so the opening move is
  // a genuine choice of direction rather than a single forced option.
  const downIdx = size;
  if (colors[downIdx] === -1 || colors[downIdx] === WHITE) {
    const used = neighborColors(downIdx, size, colors);
    const free = PRIMARY_BITS.filter(c => !used.has(c) && c !== colors[1]);
    colors[downIdx] = free.length > 0 ? rng.pick(free) : PRIMARY_BITS[0];
  }

  // Greedy fill — avoid direct neighbors only.
  // With 8 colors and at most 4 neighbors there are always >= 4 safe choices.
  for (let idx = 0; idx < size * size; idx++) {
    if (colors[idx] !== -1) continue;
    const used = neighborColors(idx, size, colors);
    const available = [];
    for (let c = 0; c < COLOR_COUNT; c++) {
      if (!used.has(c)) available.push(c);
    }
    colors[idx] = rng.pick(available);
  }

  const targets   = pickTargets(gridPath, size, targetCount, rng);
  const obstacles = scatterObstacles(size, gridPath, targets, rng);

  return { colors, targets, obstacles };
}

// ── Quadrants ─────────────────────────────────────────────────────────────

/** 0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right. */
export function quadrantOf(idx, size) {
  const r = Math.floor(idx / size);
  const c = idx % size;
  return (r * 2 >= size ? 2 : 0) + (c * 2 >= size ? 1 : 0);
}

// ── Path construction ─────────────────────────────────────────────────────

/**
 * A self-avoiding walk from the top-left start that reaches into every
 * quadrant, so targets can be spread across the whole board.
 *
 * Retries until it finds a walk that is both long enough and touches all four
 * quadrants; the perimeter loop is the fallback, since it trivially covers
 * every quadrant and can always be built.
 */
function buildPath(size, targetCount, rng) {
  const maxLen = Math.max(
    size * 2,
    Math.round(size * size * PATH_COVERAGE),
    targetCount + 1,
  );
  const minLen = Math.max(size * 2, targetCount + 1);

  for (let attempt = 0; attempt < PATH_ATTEMPTS; attempt++) {
    const path = randomWalk(size, rng, maxLen);
    if (path.length < minLen) continue;
    const quads = new Set(path.map(i => quadrantOf(i, size)));
    if (quads.size === 4) return path;
  }
  return perimeterPath(size);
}

/**
 * Randomised self-avoiding walk using Warnsdorff's rule — step to the
 * neighbour with the fewest onward moves, breaking ties at random.
 *
 * A purely random choice dead-ends almost immediately in a corner; preferring
 * the most constrained neighbour keeps the walk hugging unexplored space and
 * produces the long, winding routes the puzzle needs.
 */
function randomWalk(size, rng, maxLen) {
  const path = [0];
  const seen = new Set([0]);
  let pos = 0;

  while (path.length < maxLen) {
    const options = orthogonalNeighbors(pos, size).filter(n => !seen.has(n));
    if (options.length === 0) break;

    let fewest = Infinity;
    let tied = [];
    for (const n of options) {
      const onward = orthogonalNeighbors(n, size).filter(m => !seen.has(m)).length;
      if (onward < fewest) { fewest = onward; tied = [n]; }
      else if (onward === fewest) tied.push(n);
    }

    pos = rng.pick(tied);
    seen.add(pos);
    path.push(pos);
  }

  return path;
}

/** Lap of the border: (0,0) -> (0,N-1) -> (N-1,N-1) -> (N-1,0). */
function perimeterPath(size) {
  const N = size;
  const path = [];
  for (let c = 0; c < N; c++)      path.push(c);
  for (let r = 1; r < N; r++)      path.push(r * N + (N - 1));
  for (let c = N - 2; c >= 0; c--) path.push((N - 1) * N + c);
  return path;
}

// ── Target and obstacle placement ─────────────────────────────────────────

/**
 * Seed one target per quadrant, then fill any remaining slots by greedy
 * farthest-point selection.
 *
 * Both stages maximise the distance to the targets already chosen. Picking by
 * path order instead is what produces a diagonal streak of targets, because
 * path order correlates with position — the spacing has to be measured in grid
 * space, not path space.
 */
function pickTargets(gridPath, size, targetCount, rng) {
  let best = null;
  let bestGap = -1;

  for (let attempt = 0; attempt < TARGET_ATTEMPTS; attempt++) {
    const picked = pickTargetsOnce(gridPath, size, targetCount, rng);
    const gap = closestPair(picked, size);
    if (gap > bestGap) {
      bestGap = gap;
      best = picked;
    }
  }

  return best;
}

/** Smallest Manhattan gap between any two of `cells`; Infinity if under two. */
function closestPair(cells, size) {
  let smallest = Infinity;
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const d = manhattan(cells[i], cells[j], size);
      if (d < smallest) smallest = d;
    }
  }
  return smallest;
}

function pickTargetsOnce(gridPath, size, targetCount, rng) {
  const wanted = Math.max(1, targetCount | 0);

  // The start is burned on init and can never be re-entered, so a target
  // there would make the board silently unwinnable.
  const candidates = gridPath.filter((_, i) => i > 0);
  const byQuadrant = [[], [], [], []];
  for (const cell of candidates) byQuadrant[quadrantOf(cell, size)].push(cell);

  const targets = [];

  // Shuffle quadrant order so the same corner of the board is not always
  // seeded first, which would bias where the remaining targets can go.
  for (const q of rng.shuffle([0, 1, 2, 3])) {
    if (targets.length >= wanted) break;
    if (byQuadrant[q].length === 0) continue;
    targets.push(farthestFrom(byQuadrant[q], targets, size, rng));
  }

  while (targets.length < wanted) {
    const pool = candidates.filter(c => !targets.includes(c));
    if (pool.length === 0) break;
    targets.push(farthestFrom(pool, targets, size, rng));
  }

  return targets;
}

/** The cell in `pool` whose nearest already-chosen target is furthest away. */
function farthestFrom(pool, chosen, size, rng) {
  if (chosen.length === 0) return rng.pick(pool);

  let best = -1;
  let tied = [];
  for (const cell of pool) {
    let nearest = Infinity;
    for (const t of chosen) {
      const d = manhattan(cell, t, size);
      if (d < nearest) nearest = d;
    }
    if (nearest > best) { best = nearest; tied = [cell]; }
    else if (nearest === best) tied.push(cell);
  }
  return rng.pick(tied);
}

function manhattan(a, b, size) {
  return Math.abs(Math.floor(a / size) - Math.floor(b / size))
       + Math.abs((a % size) - (b % size));
}

/**
 * Impassable cells scattered through the off-path interior. Seeded, so a given
 * daily puzzle is identical for every player — an earlier implementation used
 * Math.random() here and silently broke that.
 */
function scatterObstacles(size, gridPath, targets, rng) {
  const blocked = new Set([...gridPath, ...targets]);
  const free = [];
  for (let i = 0; i < size * size; i++) {
    if (!blocked.has(i)) free.push(i);
  }
  rng.shuffle(free);
  const count = Math.round(free.length * OBSTACLE_DENSITY);
  return free.slice(0, count).sort((a, b) => a - b);
}

// ── Internal helpers ──────────────────────────────────────────────────────

/**
 * Find a random walk on the RYB hypercube from `start` to `target`
 * in exactly `length` steps.
 *
 * Uses forward BFS to build reachability sets, then traces back a
 * random valid path.  State space: 8 colors × ~40 steps = trivial.
 */
function buildColorWalk(start, target, length, rng) {
  // reachable[step] = Set of colors reachable from `start` in exactly `step` flips
  const reachable = [new Set([start])];
  for (let step = 1; step <= length; step++) {
    const next = new Set();
    for (const color of reachable[step - 1]) {
      for (const bit of PRIMARY_BITS) {
        next.add(color ^ bit);
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

function neighborColors(idx, size, colors) {
  return new Set(
    orthogonalNeighbors(idx, size).map(n => colors[n]).filter(c => c !== -1),
  );
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
