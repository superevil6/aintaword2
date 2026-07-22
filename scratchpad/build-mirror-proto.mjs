// Builds a self-contained Mirrorword prototype (scratchpad/mirrorword.html).
//
// Mirrorword: a diagonal mirror makes the solved board a symmetric word square
// (grid[i][j] == grid[j][i]); every row must be a real word, columns come free.
// You only ever fill the upper triangle — each off-diagonal letter reflects
// across the diagonal into the lower triangle. One word is given (top row).
//
// This builder embeds, per size n in {3,4,5}: the n-letter validity pool (so the
// page can accept ANY valid symmetric square as a win) and a bank of precomputed
// puzzles (a valid square + its top row as the given word). Run:
//   node scratchpad/build-mirror-proto.mjs

import { WORDS } from "../src/data/rootwordPool.js";
import { writeFileSync } from "node:fs";

const SIZES = [3, 4, 5];
const BANK_PER_SIZE = 400;

const byLen = {};
for (const w of WORDS) if (/^[a-z]+$/.test(w)) (byLen[w.length] ||= []).push(w);

function buildTrie(words) {
  const root = { ch: {}, word: false };
  for (const w of words) {
    let n = root;
    for (const c of w) n = n.ch[c] || (n.ch[c] = { ch: {}, word: false });
    n.word = true;
  }
  return root;
}
function descend(root, prefix) {
  let n = root;
  for (const c of prefix) { n = n.ch[c]; if (!n) return null; }
  return n;
}
function wordsWithPrefix(trie, prefix, n) {
  const node = descend(trie, prefix);
  if (!node) return [];
  const need = n - prefix.length, out = [];
  (function c(nd, acc) {
    if (acc.length === need) { if (nd.word) out.push(prefix + acc); return; }
    for (const k in nd.ch) c(nd.ch[k], acc + k);
  })(node, "");
  return out;
}

// Deterministic PRNG (reproducible banks).
let seed = 987654321;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// Randomized DFS: find a symmetric word square, backtracking on dead ends.
function randomSquare(n, trie, words) {
  const rows = [];
  function rec(i) {
    if (i === n) return true;
    let prefix = "";
    for (let j = 0; j < i; j++) prefix += rows[j][i];
    const cands = shuffle(wordsWithPrefix(trie, prefix, n));
    for (const w of cands) { rows[i] = w; if (rec(i + 1)) return true; }
    rows.length = i;
    return false;
  }
  // seed the first row randomly for variety
  const first = words[Math.floor(rnd() * words.length)];
  rows[0] = first;
  if (rec(1)) return rows.slice();
  return null;
}

const data = {};
for (const n of SIZES) {
  const words = byLen[n];
  const trie = buildTrie(words);
  const bank = [];
  const seen = new Set();
  let guard = 0;
  while (bank.length < BANK_PER_SIZE && guard < BANK_PER_SIZE * 60) {
    guard++;
    const sq = randomSquare(n, trie, words);
    if (!sq) continue;
    const key = sq.join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    bank.push(sq);
  }
  data[n] = { pool: words, bank };
  console.log(`n=${n}: pool=${words.length} bank=${bank.length}`);
}

const html = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Mirrorword — prototype</title>
<style>
  :root { color-scheme: light dark; --bg:#0f1115; --panel:#171a21; --line:#2a2f3a;
    --ink:#e8eaf0; --dim:#8b93a7; --accent:#3fb6c7; --good:#39c07a; --maybe:#c7a53f; --dead:#c74b4b; --mirror:#3fb6c7; }
  * { box-sizing:border-box; }
  html, body { overscroll-behavior:none; }
  body { margin:0; font:16px/1.5 system-ui,sans-serif; background:var(--bg); color:var(--ink);
    display:flex; flex-direction:column; align-items:center; padding:18px 12px 28px; gap:14px;
    min-height:100dvh; touch-action:manipulation; -webkit-user-select:none; user-select:none;
    -webkit-tap-highlight-color:transparent; }
  h1 { font-size:22px; margin:0; letter-spacing:.02em; }
  h1 .g { color:var(--mirror); }
  .sub { color:var(--dim); font-size:13.5px; max-width:640px; text-align:center; margin-top:-8px; }
  .controls { display:flex; gap:10px; align-items:center; flex-wrap:wrap; justify-content:center; }
  button, select { font:inherit; background:var(--panel); color:var(--ink); border:1px solid var(--line);
    border-radius:9px; padding:7px 13px; cursor:pointer; }
  button:hover, select:hover { border-color:var(--accent); }
  button.primary { background:var(--accent); color:#04222a; border-color:var(--accent); font-weight:600; }
  .boardwrap { position:relative; }
  .board { display:grid; gap:6px; background:var(--panel); padding:14px; border-radius:16px; border:1px solid var(--line); }
  .cell { width:var(--sz); height:var(--sz); border-radius:10px; border:1.5px solid var(--line);
    background:#0e1218; display:flex; align-items:center; justify-content:center; position:relative;
    font-size:calc(var(--sz)*0.46); font-weight:700; text-transform:uppercase; cursor:pointer; user-select:none;
    transition:border-color .1s, background .1s, transform .06s; }
  .cell.sel { border-color:var(--accent); box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 30%,transparent); }
  .cell.diag { background:#12181e; }
  .cell.diag::after { content:""; position:absolute; inset:0; border-radius:9px;
    background:linear-gradient(135deg, transparent 47%, color-mix(in srgb,var(--mirror) 55%,transparent) 49%, color-mix(in srgb,var(--mirror) 55%,transparent) 51%, transparent 53%); pointer-events:none; opacity:.6; }
  .cell.given { color:var(--mirror); background:#0c1a1e; border-color:color-mix(in srgb,var(--mirror) 45%,var(--line)); cursor:not-allowed; }
  .cell.mirrored { color:var(--dim); }
  .cell.flash { transform:scale(1.08); }
  .tv { position:absolute; right:3px; bottom:1px; font-size:calc(var(--sz)*0.2); font-weight:600; color:var(--dim); line-height:1; }
  .score { font-size:15px; color:var(--dim); }
  .score b { color:var(--accent); }
  /* row/col status strips */
  .rowtag { position:absolute; left:-30px; width:22px; height:var(--sz); display:flex; align-items:center; justify-content:center; font-size:14px; }
  .status { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; max-width:520px; }
  .pill { font-size:12.5px; padding:3px 9px; border-radius:20px; border:1px solid var(--line); color:var(--dim); }
  .pill.good { color:var(--good); border-color:color-mix(in srgb,var(--good) 50%,var(--line)); }
  .pill.maybe { color:var(--maybe); border-color:color-mix(in srgb,var(--maybe) 50%,var(--line)); }
  .pill.dead { color:var(--dead); border-color:color-mix(in srgb,var(--dead) 50%,var(--line)); }
  .msg { min-height:24px; font-weight:600; }
  .msg.win { color:var(--good); }
  .result { display:none; flex-direction:column; align-items:center; gap:10px; }
  .result.show { display:flex; }
  .rstat { color:var(--dim); font-size:13.5px; }
  .rstat b { color:var(--ink); }
  .rstat .star { color:var(--maybe); }
  .card { font-family:ui-monospace,Menlo,Consolas,monospace; font-size:18px; line-height:1.15; letter-spacing:2px; }
  .share { background:var(--good); color:#04231a; border-color:var(--good); font-weight:700; }
  .legend { color:var(--dim); font-size:12.5px; max-width:560px; text-align:center; }
  kbd { background:#0e1218; border:1px solid var(--line); border-radius:5px; padding:1px 6px; font-size:12px; }
  /* on-screen keyboard (mobile-first; also usable with a mouse) */
  .keyboard { display:flex; flex-direction:column; gap:7px; width:100%; max-width:500px; margin-top:2px; }
  .krow { display:flex; gap:6px; justify-content:center; }
  .key { flex:1 1 0; min-width:0; height:54px; border-radius:9px; border:1px solid var(--line);
    background:var(--panel); color:var(--ink); font:inherit; font-weight:600; text-transform:uppercase;
    display:flex; align-items:center; justify-content:center; cursor:pointer; padding:0;
    touch-action:manipulation; -webkit-tap-highlight-color:transparent; user-select:none; }
  .key:active { background:var(--accent); color:#04222a; border-color:var(--accent); }
  .key.wide { flex:1.7 1 0; font-size:17px; }
  .key.spacer { flex:.5 1 0; visibility:hidden; }
  @media (max-width:400px){ .key{ height:48px; border-radius:7px; } .krow{ gap:4px; } .keyboard{ gap:5px; } }
</style>
</head>
<body>
  <h1>Mirror<span class="g">word</span></h1>
  <p class="sub">Fill the grid so <b>every row is a real word</b>. A mirror runs down the diagonal —
  every letter you place is <b>reflected across it</b>, so each row and its matching column are the same word.
  Many squares are valid; <b>rarer letters score more</b>, and off the diagonal they count <b>double</b> (they're mirrored).
  Find the highest-scoring square you can.</p>

  <div class="controls">
    <label>Size
      <select id="size">
        <option value="3">3 × 3 — Warmup</option>
        <option value="4" selected>4 × 4 — Easy</option>
        <option value="5">5 × 5 — Medium</option>
      </select>
    </label>
    <button id="new" class="primary">New puzzle</button>
    <button id="clear">Clear</button>
    <button id="reveal">Reveal a solution</button>
  </div>

  <div class="boardwrap">
    <div id="board" class="board"></div>
  </div>

  <div class="score" id="score"></div>
  <div class="msg" id="msg"></div>
  <div class="result" id="result">
    <div class="rstat" id="rstat"></div>
    <div class="card" id="card"></div>
    <button class="share" id="share">Share result</button>
  </div>
  <div class="status" id="status"></div>
  <div class="keyboard" id="keyboard"></div>
  <div class="legend">
    Tap a cell in the upper triangle, then tap letters — each mirrors below the diagonal automatically.
    Row pills: <span style="color:var(--good)">green</span> = valid word,
    <span style="color:var(--maybe)">amber</span> = still possible, <span style="color:var(--dead)">red</span> = dead end (no word fits).
  </div>

<script>
const DATA = ${JSON.stringify(data)};

// Scrabble tile values — rarer letters pay more. The whole grid is scored, so
// an off-diagonal letter counts TWICE (it is mirrored across the diagonal); a
// diagonal letter counts once. Threading rare letters through the reflection is
// the point.
const SV = { a:1,b:3,c:3,d:2,e:1,f:4,g:2,h:4,i:1,j:8,k:5,l:1,m:3,n:1,o:1,p:3,q:10,r:1,s:1,t:1,u:1,v:4,w:4,x:8,y:4,z:10 };
const valOf = (ch) => (ch ? (SV[ch] || 0) : 0);

// Per-size validity: word Set + list + a prefix trie for fast completion search.
const POOLS = {};
for (const n of Object.keys(DATA)) {
  const list = DATA[n].pool;
  const root = { ch:{}, word:false };
  for (const w of list) { let t=root; for (const c of w) t = t.ch[c] || (t.ch[c]={ch:{},word:false}); t.word=true; }
  POOLS[n] = { set: new Set(list), list, trie: root };
}
function wordsWithPrefix(n, prefix) {
  let node = POOLS[n].trie;
  for (const c of prefix) { node = node.ch[c]; if (!node) return []; }
  const need = n - prefix.length, out = [];
  (function c(nd, acc){ if(acc.length===need){ if(nd.word) out.push(prefix+acc); return;} for(const k in nd.ch) c(nd.ch[k], acc+k); })(node, "");
  return out;
}
// Does any word of size n match this pattern (letters + '.' blanks)?
function anyMatch(n, pattern) {
  if (!pattern.includes('.')) return POOLS[n].set.has(pattern);
  const re = new RegExp('^' + pattern.replace(/\./g, '[a-z]') + '$');
  for (const w of POOLS[n].list) if (re.test(w)) return true;
  return false;
}

let N = 4, grid = [], given = new Set(), selR = 1, selC = 1;
let parScore = 0, bestScore = 0, solvedOnce = false;

// Score of the whole grid as currently filled (mirror double-counts naturally
// because applyCell writes both (r,c) and (c,r)).
function scoreGrid() {
  let s = 0; for (let r=0;r<N;r++) for (let c=0;c<N;c++) s += valOf(grid[r][c]); return s;
}
function isComplete() {
  for (let i=0;i<N;i++) if (grid[i].some(x=>!x)) return false;
  for (let i=0;i<N;i++) if (!POOLS[N].set.has(grid[i].join(''))) return false;
  return true;
}
// True par: the highest-scoring valid symmetric square completing the given top
// row. Enumerate completions (few — measured median 10–35) and take the max.
function computePar() {
  const top = grid[0].join(''); const rows = [top];
  let best = 0, cap = 60000, seen = 0;
  (function rec(i){
    if (seen >= cap) return;
    if (i === N) { seen++; let s=0; for(let r=0;r<N;r++) for(let c=0;c<N;c++) s+=valOf(rows[r][c]); if(s>best)best=s; return; }
    let p=''; for(let j=0;j<i;j++) p+=rows[j][i];
    for (const w of wordsWithPrefix(N, p)) { rows[i]=w; rec(i+1); }
    rows.length = i;
  })(1);
  return best;
}

// A cell is directly editable only in the upper triangle (c>=r) and not given.
// The lower triangle fills itself by reflection; row 0 / column 0 are the gift.
function isFillable(r, c) { return c >= r && !given.has(r + ',' + c); }
function firstFillable() {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (isFillable(r, c)) return [r, c];
  return null;
}
function nextFillable(r, c) {
  let R = r, C = c;
  while (true) { C++; if (C >= N) { C = 0; R++; } if (R >= N) return null; if (isFillable(R, C)) return [R, C]; }
}
function prevFillable(r, c) {
  let R = r, C = c;
  while (true) { C--; if (C < 0) { C = N - 1; R--; } if (R < 0) return null; if (isFillable(R, C)) return [R, C]; }
}

function newPuzzle() {
  N = +document.getElementById('size').value;
  const bank = DATA[N].bank;
  const sq = bank[Math.floor(Math.random() * bank.length)];
  grid = Array.from({length:N}, () => Array(N).fill(''));
  given = new Set();
  // give the top row (and by symmetry the left column)
  for (let j = 0; j < N; j++) { grid[0][j] = sq[0][j]; grid[j][0] = sq[0][j]; given.add('0,'+j); given.add(j+',0'); }
  const f = firstFillable(); selR = f[0]; selC = f[1];
  parScore = computePar(); bestScore = 0; solvedOnce = false;
  document.getElementById('msg').textContent = 'Fill every row with a word. Rarer letters score more — and off the diagonal they count double.';
  document.getElementById('msg').className = 'msg';
  document.getElementById('result').className = 'result';
  render();
}

// Mutate a cell and its mirror. Does NOT render (callers do).
function applyCell(r, c, ch) {
  if (given.has(r + ',' + c)) return false;
  if (grid[r][c] === ch) return false;
  grid[r][c] = ch; grid[c][r] = ch; // mirror across the diagonal
  return true;
}
function press(ch) {
  if (!isFillable(selR, selC)) { const f = firstFillable(); if (!f) return; [selR, selC] = f; }
  applyCell(selR, selC, ch);
  const nx = nextFillable(selR, selC); if (nx) { selR = nx[0]; selC = nx[1]; }
  render();
}
function backspace() {
  if (isFillable(selR, selC) && grid[selR][selC]) { applyCell(selR, selC, ''); render(); return; }
  const pv = prevFillable(selR, selC);
  if (pv) { selR = pv[0]; selC = pv[1]; applyCell(selR, selC, ''); render(); }
}

// Called after every render: keep the live score, and when the board is a
// complete valid square, bank it (best-so-far) and show the result. The board
// stays editable so you can chase a higher-scoring square — no hard lock.
function refreshScore() {
  const cur = scoreGrid();
  const pct = parScore ? Math.round(100 * cur / parScore) : 0;
  document.getElementById('score').innerHTML =
    'Score <b>' + cur + '</b> · Par <b>' + parScore + '</b>';
  if (isComplete()) {
    if (cur > bestScore) bestScore = cur;
    solvedOnce = true;
    showResult();
  }
}
function starsFor(s) { return s >= parScore ? 3 : s >= Math.ceil(parScore * 0.85) ? 2 : 1; }
function showResult() {
  const s = bestScore, st = starsFor(s);
  const m = document.getElementById('msg'); m.className = 'msg win';
  m.textContent = s >= parScore ? '✦ Optimal — the best square there is!' : '✦ Valid square';
  document.getElementById('rstat').innerHTML =
    '<b>' + s + '</b> / par <b>' + parScore + '</b>  <span class="star">' + '★'.repeat(st) + '☆'.repeat(3 - st) + '</span>' +
    (s >= parScore ? '' : ' · keep going for a rarer square');
  document.getElementById('card').textContent = shareCard();
  document.getElementById('result').className = 'result show';
}

// Spoiler-free: never the words. Row-tiles are green with a mirror-blue
// diagonal (identical for any solve, so no letters leak); the star tier encodes
// how close to par you got. The number lives in the text.
function shareCard() {
  const st = starsFor(bestScore);
  const rows = [];
  for (let r = 0; r < N; r++) {
    let line = '';
    for (let c = 0; c < N; c++) line += (r === c ? '🟦' : '🟩');
    rows.push(line);
  }
  return '★'.repeat(st) + '☆'.repeat(3 - st) + '\n' + rows.join('\n');
}
function shareText() {
  const day = new Date().toISOString().slice(0, 10);
  return 'Mirrorword ' + N + '×' + N + ' ' + day + ' — ' + bestScore + '/' + parScore + '\n' +
    shareCard() + '\n\n[link]';
}
function copyShare() {
  const text = shareText();
  const done = () => { const b = document.getElementById('share'); const t = b.textContent; b.textContent = 'Copied ✓'; setTimeout(() => b.textContent = t, 1400); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  } else fallbackCopy(text, done);
}
function fallbackCopy(text, done) {
  const ta = document.createElement('textarea'); ta.value = text;
  ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.focus(); ta.select();
  try { document.execCommand('copy'); done(); } catch (e) {} document.body.removeChild(ta);
}

function rowState(i) {
  const cells = grid[i];
  const filled = cells.every(x => x);
  const pattern = cells.map(x => x || '.').join('');
  if (filled) return POOLS[N].set.has(pattern) ? 'good' : 'dead';
  if (cells.every(x => !x)) return 'empty';
  return anyMatch(N, pattern) ? 'maybe' : 'dead';
}

function render() {
  const board = document.getElementById('board');
  // Fit the board to the viewport so a 5x5 lands comfortably on a phone.
  const avail = Math.min(window.innerWidth - 32, 460);
  const sz = Math.max(40, Math.min(N <= 3 ? 78 : 66, Math.floor((avail - (N - 1) * 6 - 28) / N)));
  board.style.setProperty('--sz', sz + 'px');
  board.style.gridTemplateColumns = 'repeat('+N+', var(--sz))';
  board.innerHTML = '';
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const d = document.createElement('div');
      d.className = 'cell';
      if (r === c) d.classList.add('diag');
      if (given.has(r+','+c)) d.classList.add('given');
      else if (r > c) d.classList.add('mirrored'); // lower triangle = reflection
      if (r === selR && c === selC) d.classList.add('sel');
      if (grid[r][c]) {
        d.appendChild(document.createTextNode(grid[r][c]));
        const v = document.createElement('span'); v.className = 'tv';
        // off-diagonal letters are mirrored, so show their doubled contribution
        v.textContent = valOf(grid[r][c]) * (r === c ? 1 : 2);
        d.appendChild(v);
      }
      // Only upper-triangle, non-given cells are selectable; others do nothing.
      if (isFillable(r, c)) d.onclick = () => { selR = r; selC = c; render(); };
      board.appendChild(d);
    }
  }
  const s = document.getElementById('status');
  s.innerHTML = '';
  for (let i = 0; i < N; i++) {
    const st = rowState(i);
    const p = document.createElement('span');
    p.className = 'pill' + (st === 'good' ? ' good' : st === 'maybe' ? ' maybe' : st === 'dead' ? ' dead' : '');
    p.textContent = 'row ' + (i+1) + (st === 'good' ? ' ✓' : st === 'dead' ? ' ✕' : st === 'maybe' ? ' …' : '');
    s.appendChild(p);
  }
  refreshScore();
}

function reveal() {
  // Reveal the PAR square (highest-scoring completion), so you can see what the
  // ceiling looks like — more useful as help than an arbitrary valid square.
  const top = grid[0].join('');
  const rows = [top]; let best = null, bestS = -1;
  (function rec(i){
    if (i===N){ let s=0; for(let r=0;r<N;r++) for(let c=0;c<N;c++) s+=valOf(rows[r][c]); if(s>bestS){bestS=s; best=rows.slice();} return; }
    let p=''; for(let j=0;j<i;j++) p+=rows[j][i];
    for (const w of wordsWithPrefix(N, p)) { rows[i]=w; rec(i+1); }
    rows.length=i;
  })(1);
  if (best) {
    for (let r=0;r<N;r++) for (let c=0;c<N;c++) grid[r][c]=best[r][c];
    render();
  } else {
    const m=document.getElementById('msg'); m.textContent='(no completion in this pool)'; m.className='msg';
  }
}

// On-screen keyboard — the primary input on touch devices.
const KB_ROWS = [
  ['q','w','e','r','t','y','u','i','o','p'],
  ['a','s','d','f','g','h','j','k','l'],
  ['z','x','c','v','b','n','m'],
];
function buildKeyboard() {
  const k = document.getElementById('keyboard');
  k.innerHTML = '';
  KB_ROWS.forEach((row, ri) => {
    const rd = document.createElement('div');
    rd.className = 'krow';
    if (ri === 1) { const s = document.createElement('div'); s.className = 'key spacer'; rd.appendChild(s); }
    row.forEach((ch) => {
      const b = document.createElement('button');
      b.className = 'key'; b.type = 'button'; b.textContent = ch;
      // pointerdown, not click: fires immediately and never lifts focus to a cell.
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); press(ch); });
      rd.appendChild(b);
    });
    if (ri === 1) { const s = document.createElement('div'); s.className = 'key spacer'; rd.appendChild(s); }
    if (ri === 2) {
      const b = document.createElement('button');
      b.className = 'key wide'; b.type = 'button'; b.textContent = '⌫';
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); backspace(); });
      rd.appendChild(b);
    }
    k.appendChild(rd);
  });
}

// Physical keyboard still works on desktop.
document.addEventListener('keydown', (e) => {
  if (/^[a-zA-Z]$/.test(e.key)) { press(e.key.toLowerCase()); }
  else if (e.key === 'Backspace') { e.preventDefault(); backspace(); }
  else if (e.key === 'ArrowRight' || e.key === 'Tab') { const n = nextFillable(selR, selC); if (n) { [selR,selC]=n; render(); } }
  else if (e.key === 'ArrowLeft') { const p = prevFillable(selR, selC); if (p) { [selR,selC]=p; render(); } }
});
window.addEventListener('resize', render);
document.getElementById('new').onclick = newPuzzle;
document.getElementById('clear').onclick = () => {
  for (let r=0;r<N;r++) for (let c=0;c<N;c++) if (!given.has(r+','+c)) grid[r][c]='';
  const f = firstFillable(); selR = f[0]; selC = f[1];
  moves = 0; solved = false;
  document.getElementById('msg').textContent=''; document.getElementById('msg').className='msg';
  document.getElementById('result').className='result';
  render();
};
document.getElementById('reveal').onclick = reveal;
document.getElementById('share').onclick = copyShare;
document.getElementById('size').onchange = newPuzzle;
buildKeyboard();
newPuzzle();
</script>
</body>
</html>`;

writeFileSync(new URL("./mirrorword.html", import.meta.url), html);
console.log("wrote scratchpad/mirrorword.html", (html.length / 1024).toFixed(0) + "KB");
