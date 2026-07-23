// The rotation maths and the searches that keep the game honest.
//
// Every function takes a `board` from shapes.js, so one implementation serves
// the square at three letters, the square at four, and the pentagon. Kept free
// of the DOM so scripts/verify-wordiamond.mjs and the build script can use it
// directly.

/** Lay a ring of words around a board, sharing corners. */
export function cellsFromWords(board, words) {
  const cells = new Array(board.cellCount);
  board.sides.forEach((side, i) => {
    side.slots.forEach((slot, j) => { cells[slot] = words[i][j]; });
  });
  return cells;
}

export const readSide = (board, cells, i) =>
  board.sides[i].slots.map((s) => cells[s]).join("");

/**
 * Which sides currently read a real word. ANY real word counts, not only the
 * one the puzzle was built from — landing a different valid ring is a win, and
 * with several solutions per puzzle that is the interesting part.
 */
export const litSides = (board, cells, words) =>
  board.sides.map((_, i) => words.has(readSide(board, cells, i)));

export const isRing = (board, cells, words) =>
  board.sides.every((_, i) => words.has(readSide(board, cells, i)));

/**
 * The cells each side can still move, given a set of locked sides.
 *
 * A lock pins a whole side, so the only cells it takes from a NEIGHBOR are
 * that neighbor's corners. The free run is therefore always contiguous in
 * reading order, which is what lets a drag stay a simple slide along the edge.
 */
export function freeSlotsFor(board, lockSet) {
  const pinned = new Set();
  lockSet.forEach((i) => board.sides[i].slots.forEach((s) => pinned.add(s)));
  return board.sides.map((side, i) =>
    lockSet.has(i) ? [] : side.slots.filter((s) => !pinned.has(s)));
}

/** Cycle a specific list of cells by `steps`, leaving every other cell alone. */
export function rotateSlots(cells, slots, steps) {
  const n = slots.length;
  if (n < 2) return cells;
  const k = ((steps % n) + n) % n;
  if (!k) return cells;
  const out = cells.slice();
  for (let i = 0; i < n; i++) out[slots[(i + k) % n]] = cells[slots[i]];
  return out;
}

/** Every state reachable from `cells` under `lockSet`, breadth first. */
function* walk(board, cells, lockSet) {
  const free = freeSlotsFor(board, lockSet);
  const seen = new Set([cells.join("")]);
  const queue = [cells];
  const dist = [0];
  for (let head = 0; head < queue.length; head++) {
    yield { cells: queue[head], dist: dist[head] };
    const cur = queue[head];
    for (let si = 0; si < board.n; si++) {
      const slots = free[si];
      if (slots.length < 2) continue;
      for (let step = 1; step < slots.length; step++) {
        const next = rotateSlots(cur, slots, step);
        const key = next.join("");
        if (!seen.has(key)) {
          seen.add(key);
          queue.push(next);
          dist.push(dist[head] + 1);
        }
      }
    }
  }
}

/**
 * Fewest moves to ANY complete valid ring, or -1 if none is reachable. A move
 * is one rotation of one side by any amount.
 *
 * Cost is bounded by the free-cell count: 5 cells on Easy, 8 on Medium. On
 * Hard a single given word leaves 11 free cells (~40M states), which is far
 * too many — but this is only ever called with at least TWO sides pinned (the
 * given plus a lock), and a second pinned side drops Hard back to 7-8 free
 * cells. See `solutionRemains`, the only caller that runs mid-game.
 */
export function shortestSolve(board, cells, lockSet, words) {
  for (const { cells: state, dist } of walk(board, cells, lockSet)) {
    if (isRing(board, state, words)) return dist;
  }
  return -1;
}

/**
 * Is any complete valid ring still reachable under these locks?
 *
 * Locking a genuinely valid word strands the player roughly half the time —
 * measured at 46.9% on Medium and 56.3% on Easy, where rotations of a
 * three-letter word are so often words themselves. Letting that happen
 * silently would leave people grinding at an impossible board.
 */
export const solutionRemains = (board, cells, lockSet, words) =>
  shortestSolve(board, cells, lockSet, words) >= 0;

/**
 * Scramble inside the free space only, so the given word is still intact — and
 * still correct — when the player arrives.
 *
 * Never shuffle letters instead: that can produce arrangements no sequence of
 * legal moves reaches, i.e. a puzzle with no solution.
 */
export function scramble(board, cells, rng, depth, given, words) {
  const free = freeSlotsFor(board, new Set([given]));
  const movable = board.sides.map((_, i) => i).filter((i) => free[i].length >= 2);
  for (let attempt = 0; attempt < 40; attempt++) {
    let cur = cells.slice();
    let last = -1;
    for (let i = 0; i < depth; i++) {
      let side;
      do {
        side = movable[Math.floor(rng() * movable.length)];
      } while (side === last && movable.length > 1);
      const slots = free[side];
      cur = rotateSlots(cur, slots, 1 + Math.floor(rng() * (slots.length - 1)));
      last = side;
    }
    // The puzzle must start unsolved. With corners shared, a scramble can land
    // on a valid ring by accident.
    if (!isRing(board, cur, words)) return cur;
  }
  return rotateSlots(cells, free[movable[0]], 1);
}

/**
 * How many complete valid rings exist for this board's letters, with `given`
 * fixed. Counted by fitting WORDS to sides rather than by walking states: the
 * state space on Hard is ~40M, while there are only ever a handful of words
 * that fit a pair of corner letters. Used at build time for the post-game
 * tally, so the browser never pays for it.
 */
export function countRings(board, cells, given, words, wordsByEnds) {
  const givenSlots = new Set(board.sides[given].slots);
  const available = new Map();
  board.positions.forEach((_, slot) => {
    if (givenSlots.has(slot)) return;
    available.set(cells[slot], (available.get(cells[slot]) ?? 0) + 1);
  });

  const order = board.sides.map((_, i) => i).filter((i) => i !== given);
  const fixed = new Array(board.cellCount).fill(null);
  givenSlots.forEach((s) => { fixed[s] = cells[s]; });

  let count = 0;
  const place = (oi, pool) => {
    if (oi === order.length) { count++; return; }
    const side = board.sides[order[oi]];
    const slots = side.slots;
    const first = fixed[slots[0]];
    const last = fixed[slots[slots.length - 1]];
    // Candidate words are indexed by their first and last letters, which the
    // corners have often already decided.
    const candidates = candidateWords(wordsByEnds, first, last);
    outer: for (const w of candidates) {
      const used = new Map();
      for (let j = 0; j < slots.length; j++) {
        const want = w[j];
        if (fixed[slots[j]] !== null) {
          if (fixed[slots[j]] !== want) continue outer;
          continue;
        }
        used.set(want, (used.get(want) ?? 0) + 1);
        if ((pool.get(want) ?? 0) < used.get(want)) continue outer;
      }
      const nextPool = new Map(pool);
      used.forEach((n, letter) => nextPool.set(letter, nextPool.get(letter) - n));
      const wrote = [];
      for (let j = 0; j < slots.length; j++) {
        if (fixed[slots[j]] === null) { fixed[slots[j]] = w[j]; wrote.push(slots[j]); }
      }
      place(oi + 1, nextPool);
      wrote.forEach((s) => { fixed[s] = null; });
    }
  };
  place(0, available);
  return count;
}

function candidateWords(byEnds, first, last) {
  if (first && last) return byEnds.pairs.get(first + last) ?? [];
  if (first) return byEnds.first.get(first) ?? [];
  if (last) return byEnds.last.get(last) ?? [];
  return byEnds.all;
}

/** Index a word list by first letter, last letter, and the pair. */
export function indexWords(list) {
  const byEnds = { all: list, first: new Map(), last: new Map(), pairs: new Map() };
  for (const w of list) {
    const f = w[0];
    const l = w[w.length - 1];
    if (!byEnds.first.has(f)) byEnds.first.set(f, []);
    byEnds.first.get(f).push(w);
    if (!byEnds.last.has(l)) byEnds.last.set(l, []);
    byEnds.last.get(l).push(w);
    if (!byEnds.pairs.has(f + l)) byEnds.pairs.set(f + l, []);
    byEnds.pairs.get(f + l).push(w);
  }
  return byEnds;
}
