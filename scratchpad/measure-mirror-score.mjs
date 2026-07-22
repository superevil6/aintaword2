// Does "best valid square wins" give a real scoring gradient?
//
// Scoring: sum Scrabble tile values over ALL n*n cells, so an off-diagonal
// letter counts twice (it's mirrored) and a diagonal letter once. Par = the
// valid symmetric square (completing the given top row) with the highest score.
// We want: for a daily seed, is max meaningfully above a naive/median square?
//
// Run: node scratchpad/measure-mirror-score.mjs

import { WORDS } from "../src/data/rootwordPool.js";

const SV = { a:1,b:3,c:3,d:2,e:1,f:4,g:2,h:4,i:1,j:8,k:5,l:1,m:3,n:1,o:1,p:3,q:10,r:1,s:1,t:1,u:1,v:4,w:4,x:8,y:4,z:10 };

const byLen = {};
for (const w of WORDS) if (/^[a-z]+$/.test(w)) (byLen[w.length] ||= []).push(w);

function buildTrie(words) {
  const root = { ch:{}, word:false };
  for (const w of words) { let n=root; for (const c of w) n = n.ch[c] || (n.ch[c]={ch:{},word:false}); n.word=true; }
  return root;
}
function descend(root, p){ let n=root; for(const c of p){ n=n.ch[c]; if(!n) return null;} return n; }
function wordsWithPrefix(trie, prefix, n){
  const node=descend(trie,prefix); if(!node) return [];
  const need=n-prefix.length,out=[];
  (function c(nd,acc){ if(acc.length===need){ if(nd.word) out.push(prefix+acc); return;} for(const k in nd.ch) c(nd.ch[k],acc+k); })(node,"");
  return out;
}
// score a full square (array of n words): sum SV over every cell (mirror doubles)
function scoreSquare(rows, n){
  let s=0; for(let r=0;r<n;r++) for(let c=0;c<n;c++) s+=SV[rows[r][c]]; return s;
}
// enumerate ALL symmetric squares completing a given top row; return their scores
function completionScores(n, trie, top, cap=20000){
  const rows=[top]; const scores=[];
  (function rec(i){
    if(scores.length>=cap) return;
    if(i===n){ scores.push(scoreSquare(rows,n)); return; }
    let p=""; for(let j=0;j<i;j++) p+=rows[j][i];
    for(const w of wordsWithPrefix(trie,p,n)){ rows[i]=w; rec(i+1); }
    rows.length=i;
  })(1);
  return scores;
}

for (const n of [4,5]) {
  const trie=buildTrie(byLen[n]);
  const words=byLen[n];
  // sample seed words that anchor >=1 square
  const seeds=[]; const step=Math.max(1,Math.floor(words.length/400));
  for(let i=0;i<words.length && seeds.length<400;i+=step) seeds.push(words[i]);

  const rows=[]; // per seed: {seed, count, min, med, max, spread}
  for(const seed of seeds){
    const sc=completionScores(n,trie,seed);
    if(!sc.length) continue;
    sc.sort((a,b)=>a-b);
    const min=sc[0], max=sc[sc.length-1], med=sc[Math.floor(sc.length/2)];
    rows.push({seed,count:sc.length,min,med,max,spread:max-med});
  }
  // only seeds with >=3 completions give a real "pick the best" choice
  const choosable=rows.filter(r=>r.count>=3);
  const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
  const pct=(a,p)=>{ const s=[...a].sort((x,y)=>x-y); return s[Math.floor(s.length*p)]; };
  const spreads=choosable.map(r=>r.spread);
  const maxMinusMin=choosable.map(r=>r.max-r.min);
  console.log(`\n=== n=${n} ===`);
  console.log(`seeds anchoring >=1 square: ${rows.length}/${seeds.length}; with >=3 completions (a real choice): ${choosable.length}`);
  console.log(`completions per choosable seed: median ${pct(choosable.map(r=>r.count),.5)}  max ${Math.max(...rows.map(r=>r.count))}`);
  console.log(`par (max) score: median ${pct(choosable.map(r=>r.max),.5)}  range ${Math.min(...choosable.map(r=>r.max))}-${Math.max(...choosable.map(r=>r.max))}`);
  console.log(`spread max-vs-median: mean ${avg(spreads).toFixed(1)}  p25 ${pct(spreads,.25)}  p75 ${pct(spreads,.75)}  (points a good solver beats a median one by)`);
  console.log(`spread max-vs-min: mean ${avg(maxMinusMin).toFixed(1)}  (best vs worst valid square)`);
  // show a few concrete examples
  const ex=[...choosable].sort((a,b)=>b.spread-a.spread).slice(0,4);
  console.log(`richest examples (seed: min/med/max over N completions):`);
  for(const r of ex) console.log(`  ${r.seed}: ${r.min}/${r.med}/${r.max} over ${r.count}`);
}
