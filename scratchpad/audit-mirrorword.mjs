// Solvability audit for every shipped Medium and Hard Mirrorword seed.
//
// For each seed: how many distinct valid symmetric word squares complete it,
// how many remain once the erasable center hint is kept, the par square's
// words, and the score spread. Flags any seed that is unsolvable (0), uniquely
// forced (1), or whose par square uses a word outside the familiar 10+20 tiers.
import { WORDS } from "../src/data/rootwordPool.js";
import { WORDS_BY_TIER } from "../src/data/commonWords.js";
import { DIFFICULTIES } from "../src/games/mirrorword/difficulty.js";
import { makePuzzle, buildTrie, wordsWithPrefix, poolOfLength, hintCells, scoreSquare } from "../src/games/mirrorword/engine.js";

// Familiar set = the curated common pool used elsewhere (tiers 10+20), for a
// "would a human know these words?" read. rootwordPool intentionally also holds
// tier-35 obscurities, which are fine to *allow* but worth flagging in a solution.
const familiar = new Set([...(WORDS_BY_TIER["10"] || []), ...(WORDS_BY_TIER["20"] || [])]);

function allCompletions(trie, n, seed) {
  const rows = [seed], out = [];
  (function rec(i) {
    if (i === n) { out.push(rows.slice()); return; }
    let p = ""; for (let j = 0; j < i; j++) p += rows[j][i];
    for (const w of wordsWithPrefix(trie, p, n)) { rows[i] = w; rec(i + 1); }
    rows.length = i;
  })(1);
  return out;
}

for (const id of ["medium", "hard"]) {
  const prof = DIFFICULTIES[id];
  const n = prof.size;
  const trie = buildTrie(poolOfLength(WORDS, n));
  const hCells = hintCells(n, prof.hint || 0);

  let unsolvable = 0, forced = 0, obscurePar = 0, minCount = Infinity;
  console.log(`\n===== ${prof.label} (${n}×${n}) — ${prof.seeds.length} seeds =====`);
  for (const seed of prof.seeds) {
    const pz = makePuzzle({ size: n, seed }, WORDS);
    const comps = allCompletions(trie, n, seed);
    const total = comps.length;
    // completions consistent with the kept hint (diagonal cells == optimal's)
    const withHint = comps.filter((sq) => hCells.every(([r, c]) => sq[r][c] === pz.best[r][c])).length;
    const scores = comps.map(scoreSquare).sort((a, b) => a - b);
    const parWords = pz.best.join(" ");
    const obscure = pz.best.filter((w) => !familiar.has(w));

    if (total === 0) unsolvable++;
    if (total === 1) forced++;
    if (obscure.length) obscurePar++;
    minCount = Math.min(minCount, total);

    const flag = total === 0 ? " ❌UNSOLVABLE" : total === 1 ? " ⚠forced(1)" : "";
    const obsFlag = obscure.length ? `  obscure:[${obscure.join(",")}]` : "";
    console.log(
      `  ${seed}  sols=${String(total).padStart(3)}  keepHint=${String(withHint).padStart(3)}  ` +
      `score=${scores[0]}–${scores[scores.length - 1]}  par:[${parWords}]${flag}${obsFlag}`
    );
  }
  console.log(`  — summary: unsolvable=${unsolvable}, uniquely-forced=${forced}, ` +
    `par-uses-obscure-word=${obscurePar}, fewest solutions=${minCount}`);
}
