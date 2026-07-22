// How much do different "middle hints" ease a 5×5? Models a top-down filler that
// picks a random valid word per mirror-forced prefix, and measures how often it
// reaches a valid square (higher = easier) under each hint level.
import { WORDS } from "../src/data/rootwordPool.js";
import { DIFFICULTIES } from "../src/games/mirrorword/difficulty.js";
import { makePuzzle, buildTrie, wordsWithPrefix, poolOfLength, hintCells } from "../src/games/mirrorword/engine.js";

const n = 5;
const trie = buildTrie(poolOfLength(WORDS, n));
let seed = 20260722;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

// hintedRows: Map(rowIndex -> forcedLetterAtDiagonal) for diagonal hints,
// or centerRowFull: the full best row m to lock.
function solveRate(topRow, diagHints, centerRow) {
  let solved = 0, trials = 3000;
  for (let t = 0; t < trials; t++) {
    const rows = [topRow];
    let ok = true;
    for (let i = 1; i < n; i++) {
      if (centerRow && i === centerRow.idx) { rows[i] = centerRow.word; continue; }
      let prefix = "";
      for (let j = 0; j < i; j++) prefix += rows[j][i];
      let cands = wordsWithPrefix(trie, prefix, n);
      if (diagHints.has(i)) cands = cands.filter((w) => w[i] === diagHints.get(i));
      if (!cands.length) { ok = false; break; }
      rows[i] = cands[Math.floor(rnd() * cands.length)];
    }
    if (ok) solved++;
  }
  return solved / trials;
}

const levels = { "no hint": 0, "1 diag": 1, "2 diag": 2, "3 diag (spine)": 3 };
const sums = {}; for (const k in levels) sums[k] = 0;
let sumCenterRow = 0;
const k = DIFFICULTIES.medium.seeds.length;

for (const s of DIFFICULTIES.medium.seeds) {
  const pz = makePuzzle({ size: n, seed: s }, WORDS);
  for (const [name, count] of Object.entries(levels)) {
    const diag = new Map();
    for (const [r, c] of hintCells(n, count)) diag.set(r, pz.best[r][c]);
    sums[name] += solveRate(s, diag, null);
  }
  const m = Math.floor(n / 2);
  sumCenterRow += solveRate(s, new Map(), { idx: m, word: pz.best[m] });
}

console.log(`5×5 random top-down fill — clean-solve rate (higher = easier):`);
for (const name in levels) console.log(`  ${name.padEnd(16)}: ${(100 * sums[name] / k).toFixed(2)}%`);
console.log(`  center row (full): ${(100 * sumCenterRow / k).toFixed(2)}%`);
