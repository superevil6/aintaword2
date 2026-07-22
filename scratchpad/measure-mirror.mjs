// Measurement pass for the "reflection grid" (Mirrorword) concept.
//
// A diagonal mirror makes the solved board a SYMMETRIC word square:
// an n x n grid with grid[i][j] == grid[j][i], every row a valid word
// (so every column, equal to its row, is automatically a word too).
//
// We measure, per size n:
//   - pool size (n-letter words), split familiar (10+20) vs generous (35)
//   - how many symmetric squares exist (capped), and how fast they saturate
//   - branching: given a fixed first row (the "given word"), how many squares
//     complete it -> is the puzzle uniquely/near-uniquely solvable or a mush?
//   - feedback density proxy: at each row placement, what fraction of legal
//     prefixes actually have a completing word (never a dead, unguided move)
//
// Run: node scratchpad/measure-mirror.mjs

import { WORDS } from "../src/data/rootwordPool.js";

// ---- tier split: rebuild familiar (10+20) set to gauge difficulty by pool ----
// rootwordPool is 10+20+35 merged; we don't have tiers here, so we approximate
// "familiar" by intersecting with the curated 5-15 pool is impossible for short
// words. Instead just use the whole pool but ALSO report using only words that
// look common (all letters, no rare). Simpler: measure on full pool; tier
// filtering is a generation-time knob we can add later.

const byLen = {};
for (const w of WORDS) {
  if (/^[a-z]+$/.test(w)) (byLen[w.length] ||= []).push(w);
}

function buildTrie(words) {
  const root = { ch: {}, word: false, count: 0 };
  for (const w of words) {
    let n = root;
    n.count++;
    for (const c of w) {
      n = n.ch[c] || (n.ch[c] = { ch: {}, word: false, count: 0 });
      n.count++;
    }
    n.word = true;
  }
  return root;
}

// Does the trie contain any word with this exact prefix? return node or null.
function descend(root, prefix) {
  let n = root;
  for (const c of prefix) {
    n = n.ch[c];
    if (!n) return null;
  }
  return n;
}

// Enumerate symmetric word squares of size n.
// Build row by row. By symmetry, row i's first i letters are forced:
//   row[i][j] = grid[i][j] = grid[j][i] = row[j][i]   for j < i
// so the prefix of row i is (row0[i], row1[i], ..., row_{i-1}[i]).
// We need an n-letter word with that prefix. Trie makes this cheap.
function countSquares(n, { cap = Infinity, fixedFirst = null, wordsByPrefix } = {}) {
  const words = byLen[n];
  const trie = buildTrie(words);
  let found = 0;
  let capped = false;
  // feedback stats
  let placements = 0, liveExtensions = 0;

  const rows = [];
  function rec(i) {
    if (found >= cap) { capped = true; return; }
    if (i === n) { found++; return; }
    // forced prefix for row i
    let prefix = "";
    for (let j = 0; j < i; j++) prefix += rows[j][i];
    // candidate words for row i: length n, startsWith(prefix)
    const node = descend(trie, prefix);
    if (!node) return; // dead: no word completes this prefix
    // gather candidate words under node
    const cands = [];
    const need = n - prefix.length; // completing suffix length
    (function collect(nd, acc) {
      if (acc.length === need) { if (nd.word) cands.push(prefix + acc); return; }
      for (const c in nd.ch) collect(nd.ch[c], acc + c);
    })(node, "");
    placements++;
    if (cands.length > 0) liveExtensions++;
    for (const w of cands) {
      if (i === 0 && fixedFirst && w !== fixedFirst) continue;
      rows[i] = w;
      rec(i + 1);
      if (found >= cap) { capped = true; break; }
    }
    rows.length = i;
  }
  rec(0);
  return { found, capped, liveRate: placements ? liveExtensions / placements : 0 };
}

console.log("=== Symmetric word square counts (full 10+20+35 pool) ===");
for (let n = 3; n <= 6; n++) {
  const cap = n >= 5 ? 500000 : Infinity;
  const t0 = Date.now();
  const { found, capped } = countSquares(n, { cap });
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `n=${n}: pool=${byLen[n].length}  squares=${found}${capped ? "+ (capped)" : ""}  (${dt}s)`
  );
}

console.log("\n=== Branching given a fixed first word (n=5) ===");
// For a sample of first words, how many squares complete each?
// Low & nonzero -> a 'given word' yields a tight, real puzzle.
{
  const n = 5;
  const words = byLen[n];
  // pick 40 spread-out first words that begin at least one square
  const sample = [];
  for (let i = 0; i < words.length && sample.length < 60; i += Math.floor(words.length / 60)) {
    sample.push(words[i]);
  }
  const counts = [];
  for (const fw of sample) {
    const { found } = countSquares(n, { cap: 100000, fixedFirst: fw });
    if (found > 0) counts.push([fw, found]);
  }
  counts.sort((a, b) => a[1] - b[1]);
  const solvable = counts.length;
  const nums = counts.map((c) => c[1]);
  const median = nums.length ? nums[Math.floor(nums.length / 2)] : 0;
  console.log(`of ${sample.length} sampled first words, ${solvable} anchor >=1 square`);
  if (nums.length) {
    console.log(`completions per solvable first word: min=${nums[0]} median=${median} max=${nums[nums.length-1]}`);
    console.log("tightest (good daily anchors):", counts.slice(0, 8).map(c => `${c[0]}:${c[1]}`).join("  "));
    console.log("loosest:", counts.slice(-5).map(c => `${c[0]}:${c[1]}`).join("  "));
  }
}

console.log("\n=== Strand rate: greedy top-down fill (pick random valid word per forced prefix) ===");
// Models a player filling row by row, choosing any word that fits the letters
// the mirror has already forced. How often does that dead-end vs. complete?
{
  function trieFor(n) { return buildTrie(byLen[n]); }
  function wordsWithPrefix(trie, prefix, n) {
    const node = descend(trie, prefix);
    if (!node) return [];
    const need = n - prefix.length, out = [];
    (function c(nd, acc){ if(acc.length===need){ if(nd.word) out.push(prefix+acc); return;} for(const k in nd.ch) c(nd.ch[k], acc+k); })(node, "");
    return out;
  }
  // deterministic PRNG so the run is reproducible
  let seed = 12345; const rnd = () => (seed = (seed*1103515245+12345) & 0x7fffffff) / 0x7fffffff;
  for (const n of [3,4,5,6]) {
    const trie = trieFor(n);
    const words = byLen[n];
    let trials = 4000, solved = 0, stranded = 0;
    for (let t=0;t<trials;t++){
      const rows = [words[Math.floor(rnd()*words.length)]];
      let ok = true;
      for (let i=1;i<n;i++){
        let prefix=""; for(let j=0;j<i;j++) prefix+=rows[j][i];
        const cands = wordsWithPrefix(trie, prefix, n);
        if (!cands.length){ ok=false; break; }
        rows[i] = cands[Math.floor(rnd()*cands.length)];
      }
      if (ok) solved++; else stranded++;
    }
    console.log(`n=${n}: random top-down fill  solved=${(100*solved/trials).toFixed(1)}%  stranded=${(100*stranded/trials).toFixed(1)}%`);
  }
}
