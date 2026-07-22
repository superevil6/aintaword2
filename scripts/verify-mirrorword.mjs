// Verifies Mirrorword's daily integrity from Node, the way the sibling verify
// scripts do — re-deriving par from the same shipped pool the browser uses, so
// a bad seed or a scoring regression fails the build rather than a player.
//
// For every curated seed at every tier it checks that the engine's optimal
// square is a genuine, complete, symmetric word square whose top row is the
// seed and whose score equals the reported par; and that the daily seed pick is
// deterministic and drawn from the tier's list.
//
// Run: node scripts/verify-mirrorword.mjs   (or: npm run verify:mirrorword)

import { WORDS } from "../src/data/rootwordPool.js";
import { DIFFICULTIES, DIFFICULTY_ORDER, seedFor } from "../src/games/mirrorword/difficulty.js";
import { makePuzzle, scoreSquare, isSolved } from "../src/games/mirrorword/engine.js";

let fail = 0, checks = 0;
function assert(cond, msg) { checks++; if (!cond) { fail++; console.error("  FAIL:", msg); } }

for (const id of DIFFICULTY_ORDER) {
  const prof = DIFFICULTIES[id];
  const n = prof.size;
  let minPar = Infinity, maxPar = 0, minComp = Infinity;

  for (const seed of prof.seeds) {
    assert(seed.length === n, `${id} "${seed}": seed length is ${n}`);
    const pz = makePuzzle({ size: n, seed }, WORDS);
    const best = pz.best;

    assert(pz.par > 0, `${id} "${seed}": par > 0`);
    assert(best[0] === seed, `${id} "${seed}": optimal top row is the seed`);

    let sym = true;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (best[r][c] !== best[c][r]) sym = false;
    assert(sym, `${id} "${seed}": optimal square is symmetric`);

    let allWords = true;
    for (const row of best) if (!pz.wordSet.has(row)) allWords = false;
    assert(allWords, `${id} "${seed}": every row of the optimal is a word`);

    assert(scoreSquare(best) === pz.par, `${id} "${seed}": optimal score equals par`);
    assert(isSolved(best.map((w) => w.split("")), pz.wordSet), `${id} "${seed}": isSolved(optimal)`);

    minPar = Math.min(minPar, pz.par); maxPar = Math.max(maxPar, pz.par);
  }

  // Daily selection is deterministic, in-list, and repeat-free until the pool
  // cycles: every day in one full period must land on a distinct seed.
  const s1 = seedFor(prof, "2026-07-22"), s2 = seedFor(prof, "2026-07-22");
  assert(s1 === s2 && prof.seeds.includes(s1), `${id}: seedFor is deterministic and in-list`);
  const period = prof.seeds.length;
  const picks = new Set();
  const base = Date.UTC(2026, 6, 22);
  for (let d = 0; d < period; d++) {
    picks.add(seedFor(prof, new Date(base + d * 86400000).toISOString().slice(0, 10)));
  }
  assert(picks.size === period, `${id}: ${period} consecutive days give ${period} distinct puzzles (got ${picks.size})`);

  console.log(`  ${prof.label} (${n}×${n}): ${prof.seeds.length} seeds, par ${minPar}–${maxPar}`);
}

console.log(fail ? `\n${checks - fail}/${checks} checks passed — ${fail} FAILED` : `\nall ${checks} checks passed`);
process.exit(fail ? 1 : 0);
