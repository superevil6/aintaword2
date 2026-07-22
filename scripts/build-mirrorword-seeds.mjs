// Generates curated daily seed lists for Mirrorword, one per TIER.
//
// A Mirrorword daily is a board size n and a SEED (the given top row = left
// column). Par is the highest-scoring valid symmetric square completing that
// seed, found at runtime by the engine. For the scoring to be a real choice we
// only keep seeds that anchor several valid squares AND have real spread between
// the best- and worst-scoring square — the same "filter hard" discipline as the
// other games.
//
// Tiers (chosen 2026-07-22 to hit 120 seeds each with the 4/5/… size ladder):
//   easy   4×4, gentle bar
//   medium 5×5, gentle bar, two center hints (applied at runtime)
//   hard   5×5, STEEP spread bar + NO hint — the expert cut of the same board,
//          disjoint from medium's seeds so a given word never appears in both.
// (6×6 was dropped as a tier: only ~57 six-letter seeds clear a decent bar, too
//  few for 120; see design notes.)
//
// Prints ready-to-paste arrays for src/games/mirrorword/difficulty.js.
// Run: node scripts/build-mirrorword-seeds.mjs

import { WORDS } from "../src/data/rootwordPool.js";

const SV = { a:1,b:3,c:3,d:2,e:1,f:4,g:2,h:4,i:1,j:8,k:5,l:1,m:3,n:1,o:1,p:3,q:10,r:1,s:1,t:1,u:1,v:4,w:4,x:8,y:4,z:10 };
const valOf = (ch) => SV[ch] || 0;

const byLen = {};
for (const w of WORDS) if (/^[a-z]+$/.test(w)) (byLen[w.length] ||= []).push(w);

function buildTrie(words) {
  const root = { ch:{}, word:false };
  for (const w of words) { let t=root; for (const c of w) t = t.ch[c] || (t.ch[c]={ch:{},word:false}); t.word=true; }
  return root;
}
function descend(root, p){ let n=root; for(const c of p){ n=n.ch[c]; if(!n) return null;} return n; }
function wordsWithPrefix(trie, prefix, n){
  const node=descend(trie,prefix); if(!node) return [];
  const need=n-prefix.length,out=[];
  (function c(nd,acc){ if(acc.length===need){ if(nd.word) out.push(prefix+acc); return;} for(const k in nd.ch) c(nd.ch[k],acc+k); })(node,"");
  return out;
}
function scoreSquare(rows, n){ let s=0; for(let r=0;r<n;r++) for(let c=0;c<n;c++) s+=valOf(rows[r][c]); return s; }
function completionScores(n, trie, top, cap = 40000){
  const rows=[top], scores=[];
  (function rec(i){
    if (scores.length >= cap) return;
    if (i === n) { scores.push(scoreSquare(rows, n)); return; }
    let p=""; for(let j=0;j<i;j++) p+=rows[j][i];
    for (const w of wordsWithPrefix(trie, p, n)) { rows[i]=w; rec(i+1); }
    rows.length = i;
  })(1);
  return scores;
}

const TIERS = [
  { id: "easy",   size: 4, minCount: 4, minSpread: 8,  take: 120, perFirst: 8 },
  { id: "medium", size: 5, minCount: 4, minSpread: 7,  take: 120, perFirst: 8 },
  { id: "hard",   size: 5, minCount: 4, minSpread: 12, take: 120, perFirst: 8, exclude: "medium" },
];

const chosen = {}; // id -> Set(seed)

for (const t of TIERS) {
  const n = t.size;
  const trie = buildTrie(byLen[n]);
  const words = byLen[n];
  const excludeSet = t.exclude ? chosen[t.exclude] : null;
  const qualifying = [];
  const perFirst = {};
  let anchor = 0;
  for (const seed of words) {
    if (excludeSet && excludeSet.has(seed)) continue;
    const sc = completionScores(n, trie, seed);
    if (sc.length < t.minCount) continue;
    anchor++;
    sc.sort((a, b) => a - b);
    const min = sc[0], max = sc[sc.length - 1];
    if (max - min < t.minSpread) continue;
    const f = seed[0];
    if ((perFirst[f] || 0) >= t.perFirst) continue;
    perFirst[f] = (perFirst[f] || 0) + 1;
    qualifying.push({ seed, par: max, count: sc.length, spread: max - min });
  }
  const kept = [];
  if (qualifying.length <= t.take) kept.push(...qualifying);
  else { const step = qualifying.length / t.take; for (let i = 0; i < t.take; i++) kept.push(qualifying[Math.floor(i * step)]); }

  chosen[t.id] = new Set(kept.map((k) => k.seed));
  const pars = kept.map((k) => k.par).sort((a, b) => a - b);
  const spreads = kept.map((k) => k.spread).sort((a, b) => a - b);
  console.log(`\n// ===== ${t.id} : ${t.size}×${t.size}, ${kept.length} seeds (bar: ≥${t.minCount} sols, spread ≥${t.minSpread}${t.exclude ? `, excl ${t.exclude}` : ""}) =====`);
  console.log(`// par ${pars[0]}–${pars[pars.length-1]} (median ${pars[Math.floor(pars.length/2)]}); spread ${spreads[0]}–${spreads[spreads.length-1]} (median ${spreads[Math.floor(spreads.length/2)]})`);
  console.log(`seeds: [${kept.map((k) => `"${k.seed}"`).join(", ")}],`);
}
