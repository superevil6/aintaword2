// Mirrorword engine — the pure puzzle logic, free of any DOM.
//
// A Mirrorword puzzle is a size n and a SEED (the given top row, which by the
// diagonal mirror is also the left column). You fill the upper triangle; every
// letter reflects across the diagonal, so a solved board is a SYMMETRIC word
// square — grid[i][j] == grid[j][i], every row a real word (and each column,
// equal to its row, a word too).
//
// Scoring makes the mirror the point: sum Scrabble tile values over ALL n*n
// cells, so an off-diagonal letter counts TWICE (it is reflected) and a
// diagonal letter once. Many squares are valid; the day's PAR is the highest
// scoring one, found by enumerating completions of the seed.
//
// Kept DOM-free on purpose (like rootword's engine and colorpath's model): the
// scripts/verify-mirrorword.mjs re-derives par under Node from the same shipped
// pool, so every player worldwide gets an identical, deterministic par.

/** Scrabble tile values — rarer letters pay more. */
export const TILE_VALUE = {
  a:1,b:3,c:3,d:2,e:1,f:4,g:2,h:4,i:1,j:8,k:5,l:1,m:3,
  n:1,o:1,p:3,q:10,r:1,s:1,t:1,u:1,v:4,w:4,x:8,y:4,z:10,
};

/** Value of a single letter (0 for a blank/empty cell). */
export function valueOf(ch) {
  return ch ? (TILE_VALUE[ch] || 0) : 0;
}

/** The words of exactly length n from a pool (the validity set for size n). */
export function poolOfLength(pool, n) {
  return pool.filter((w) => w.length === n);
}

/** Build a prefix trie over a word list, for fast completion search. */
export function buildTrie(words) {
  const root = { ch: Object.create(null), word: false };
  for (const w of words) {
    let t = root;
    for (const c of w) t = t.ch[c] || (t.ch[c] = { ch: Object.create(null), word: false });
    t.word = true;
  }
  return root;
}

/** Every length-n word extending `prefix` (using the trie). */
export function wordsWithPrefix(trie, prefix, n) {
  let node = trie;
  for (const c of prefix) { node = node.ch[c]; if (!node) return []; }
  const need = n - prefix.length, out = [];
  (function walk(nd, acc) {
    if (acc.length === need) { if (nd.word) out.push(prefix + acc); return; }
    for (const k in nd.ch) walk(nd.ch[k], acc + k);
  })(node, "");
  return out;
}

/**
 * Score a full square (array of n equal-length row strings): sum tile values
 * over every cell. Off-diagonal letters are counted twice by construction —
 * the grid is symmetric, so cell (r,c) and its mirror (c,r) both contribute.
 */
export function scoreSquare(rows) {
  const n = rows.length;
  let s = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) s += valueOf(rows[r][c]);
  return s;
}

/** Score a partially-filled grid (2D array of chars/''), same rule. */
export function scoreGrid(grid) {
  let s = 0;
  for (const row of grid) for (const ch of row) s += valueOf(ch);
  return s;
}

/**
 * True par + the optimal square: the highest-scoring valid symmetric square
 * whose top row is `seed`. Builds row by row — by symmetry row i's first i
 * letters are forced by the rows above (row[i][j] = row[j][i]) — and enumerates
 * every completion, which is few for curated seeds.
 *
 * @returns {{par:number, best:string[]}}
 */
export function bestSquare(trie, n, seed) {
  const rows = [seed];
  let best = null, bestScore = -1, seen = 0;
  const CAP = 200000; // safety bound; curated seeds are far below this
  (function rec(i) {
    if (seen >= CAP) return;
    if (i === n) {
      seen++;
      const s = scoreSquare(rows);
      if (s > bestScore) { bestScore = s; best = rows.slice(); }
      return;
    }
    let prefix = "";
    for (let j = 0; j < i; j++) prefix += rows[j][i];
    for (const w of wordsWithPrefix(trie, prefix, n)) { rows[i] = w; rec(i + 1); }
    rows.length = i;
  })(1);
  return { par: bestScore < 0 ? 0 : bestScore, best: best || [seed] };
}

/**
 * The `count` diagonal cells nearest the center — the hint positions. The
 * diagonal is the mirror axis, so a hint here is self-mirrored (a single
 * letter) and anchors the spine of the square. Cell (0,0) is excluded because
 * the seed already gives it.
 *
 * @returns {Array<[number, number]>} [i,i] pairs, most-central first
 */
export function hintCells(n, count) {
  if (!count) return [];
  const center = (n - 1) / 2;
  const idx = [];
  for (let i = 1; i < n; i++) idx.push(i);
  idx.sort((a, b) => Math.abs(a - center) - Math.abs(b - center) || a - b);
  return idx.slice(0, count).map((i) => [i, i]);
}

/** Is `grid` a complete, valid symmetric word square over `wordSet`? */
export function isSolved(grid, wordSet) {
  const n = grid.length;
  for (let i = 0; i < n; i++) if (grid[i].some((x) => !x)) return false;
  for (let i = 0; i < n; i++) if (!wordSet.has(grid[i].join(""))) return false;
  return true;
}

/**
 * Bundle a full puzzle from `{ size, seed }` and a word pool: the length-n
 * validity set (any valid square wins, so this is needed at runtime), a prefix
 * trie, and the day's true par with its optimal square.
 */
export function makePuzzle({ size, seed }, pool) {
  const words = poolOfLength(pool, size);
  const wordSet = new Set(words);
  const trie = buildTrie(words);
  const { par, best } = bestSquare(trie, size, seed);
  return { size, seed, words, wordSet, trie, par, best };
}
