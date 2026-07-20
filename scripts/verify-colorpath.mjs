// Headless verification of the Color Path generator — no browser needed.
//
//   node scripts/verify-colorpath.mjs
//
// Three passes:
//
//   1. STRUCTURAL — hammers generateGrid() across every difficulty and asserts
//      the invariants the game depends on:
//        - start cell is WHITE, every cell is colored
//        - no two orthogonally adjacent cells share a color
//        - every quadrant holds a target (when there are >= 4 to place)
//        - target count matches the difficulty, with no duplicates
//        - the start cell is never a target (it is burned on init, so a target
//          there can never be collected — a silently unwinnable board)
//        - obstacles never sit on a target
//        - identical seeds produce byte-identical output
//
//   2. SOLVABLE — brute-force searches for a route that collects every target
//      under the real move rules. A generator that produces pretty but
//      unwinnable boards passes pass 1 and fails here.
//
//   3. CROSS-CHECK — walks real Grid instances and asserts Grid.targetsFor()
//      agrees with the independent move enumeration below.
//
// As in verify.mjs, the move rules are reimplemented here on purpose rather
// than imported from grid.js, so the test does not validate the code against
// itself. Pass 3 is what ties the two implementations back together.

import { generateGrid, quadrantOf } from "../src/games/colorpath/generator.js";
import { DIFFICULTIES } from "../src/games/colorpath/difficulty.js";
import { Grid } from "../src/games/colorpath/grid.js";
import { WHITE } from "../src/games/colorpath/colors.js";
import { Rng } from "../src/core/rng.js";

const PRIMARIES = [1, 2, 4];

const STRUCTURAL_SEEDS = 2000;
const SOLVE_SEEDS = { easy: 200, medium: 200, hard: 60 };
const NODE_CAP = 4_000_000;
const VARIETY_SEEDS = 500;

const failures = [];
const fail = (tier, seed, msg) => failures.push(`[${tier} seed=${seed}] ${msg}`);

// ── Independent reimplementation of the rules ────────────────────────────

function neighbors(idx, N) {
  const r = Math.floor(idx / N), c = idx % N, out = [];
  if (r > 0)     out.push((r - 1) * N + c);
  if (r < N - 1) out.push((r + 1) * N + c);
  if (c > 0)     out.push(r * N + (c - 1));
  if (c < N - 1) out.push(r * N + (c + 1));
  return out;
}

/** Cells reachable from `pos` by flipping `bit`, ignoring burned and blocked. */
function movesFor(N, colors, obstacles, burned, pos, bit) {
  const want = (colors[pos] ^ bit) & 0b111;
  return neighbors(pos, N)
    .filter(n => colors[n] === want && !burned.has(n) && !obstacles.has(n))
    .sort((a, b) => a - b);
}

// ── Pass 2: solvability ───────────────────────────────────────────────────

function solve(N, colors, targets, obstacles) {
  const obs = new Set(obstacles);
  const tgt = new Set(targets);
  const burned = new Set([0]);
  let collected = 0;
  let nodes = 0;

  function dfs(pos) {
    if (collected === tgt.size) return true;
    if (++nodes > NODE_CAP) return false;
    for (const bit of PRIMARIES) {
      for (const n of movesFor(N, colors, obs, burned, pos, bit)) {
        burned.add(n);
        const isTarget = tgt.has(n);
        if (isTarget) collected++;
        if (dfs(n)) return true;
        if (isTarget) collected--;
        burned.delete(n);
      }
    }
    return false;
  }

  return { ok: dfs(0), nodes };
}

// ── Pass 3: agreement with the real Grid ─────────────────────────────────

function crossCheck(N, colors, targets, obstacles, rng) {
  const grid = new Grid(N, colors, targets, obstacles);
  const obs = new Set(obstacles);
  const burned = new Set([0]);
  let pos = 0;

  for (let step = 0; step < N * N; step++) {
    const all = [];
    for (const bit of PRIMARIES) {
      const mine = movesFor(N, colors, obs, burned, pos, bit);
      const theirs = grid.targetsFor(bit).slice().sort((a, b) => a - b);
      if (mine.join(",") !== theirs.join(",")) {
        return `Grid.targetsFor(${bit}) at cell ${pos}: got [${theirs}] want [${mine}]`;
      }
      all.push(...mine);
    }
    if (all.length === 0) break;
    const next = rng.pick(all);
    grid.moveForward(next);
    burned.add(next);
    pos = next;
  }

  if (grid.currentIndex !== pos) return `Grid.currentIndex drifted from walk`;
  return null;
}

// ── Run ───────────────────────────────────────────────────────────────────

const tiers = Object.values(DIFFICULTIES);
console.log(
  "difficulties: " +
  tiers.map(d => `${d.id} ${d.size}x${d.size}/${d.targetCount}`).join(" | "),
);

const spreadStats = new Map(); // tier -> { minGap, quadHist }

for (const d of tiers) {
  const N = d.size;
  const wantQuads = Math.min(4, d.targetCount);
  const stats = {
    minGap: Infinity, quadHist: [0, 0, 0, 0], gapSum: 0, tight: 0, n: 0,
    openSum: 0, forcedOpen: 0,
  };
  spreadStats.set(d.id, stats);

  for (let s = 0; s < STRUCTURAL_SEEDS; s++) {
    const seed = `colorpath:verify:${d.id}:${s}`;
    let out;
    try {
      out = generateGrid(N, d.targetCount, new Rng(seed));
    } catch (e) {
      fail(d.id, s, `generateGrid threw: ${e.message}`);
      continue;
    }
    const { colors, targets, obstacles } = out;

    if (colors[0] !== WHITE) fail(d.id, s, `start color ${colors[0]} is not WHITE`);

    // Quadrant coverage — the headline requirement.
    const quads = new Set(targets.map(t => quadrantOf(t, N)));
    if (quads.size !== wantQuads) {
      fail(d.id, s, `targets cover ${quads.size} quadrant(s), expected ${wantQuads}`);
    }
    for (const q of quads) stats.quadHist[q]++;

    // Clustering probe: per-board, how close are the two nearest targets?
    let boardMin = Infinity;
    for (let i = 0; i < targets.length; i++) {
      for (let j = i + 1; j < targets.length; j++) {
        const a = targets[i], b = targets[j];
        const gap = Math.abs(Math.floor(a / N) - Math.floor(b / N))
                  + Math.abs((a % N) - (b % N));
        if (gap < boardMin) boardMin = gap;
        if (gap === 0) fail(d.id, s, `two targets on the same cell`);
      }
    }
    // Opening choice: how many primaries are live on move one? A board that
    // offers exactly one is a forced first move and teaches the player nothing.
    const obs = new Set(obstacles);
    let liveOpenings = 0;
    for (const bit of PRIMARIES) {
      if (movesFor(N, colors, obs, new Set([0]), 0, bit).length > 0) liveOpenings++;
    }
    stats.openSum += liveOpenings;
    if (liveOpenings < 2) stats.forcedOpen++;

    stats.n++;
    stats.gapSum += boardMin;
    if (boardMin < stats.minGap) stats.minGap = boardMin;
    if (boardMin <= 2) stats.tight++;

    if (targets.length !== d.targetCount) {
      fail(d.id, s, `${targets.length} targets, expected ${d.targetCount}`);
    }
    if (new Set(targets).size !== targets.length) fail(d.id, s, `duplicate targets`);
    if (targets.includes(0)) fail(d.id, s, `start cell is a target (unwinnable)`);

    for (let i = 0; i < N * N; i++) {
      if (colors[i] === -1 || colors[i] == null) fail(d.id, s, `cell ${i} uncolored`);
      for (const n of neighbors(i, N)) {
        if (colors[i] === colors[n]) {
          fail(d.id, s, `adjacent cells ${i}/${n} share color ${colors[i]}`);
        }
      }
    }
    for (const o of obstacles) {
      if (targets.includes(o)) fail(d.id, s, `obstacle ${o} sits on a target`);
    }

    const repeat = generateGrid(N, d.targetCount, new Rng(seed));
    if (JSON.stringify(repeat) !== JSON.stringify(out)) {
      fail(d.id, s, `not deterministic for an identical seed`);
    }

    if (s < 200) {
      const drift = crossCheck(N, colors, targets, obstacles, new Rng(`walk:${seed}`));
      if (drift) fail(d.id, s, drift);
    }
  }
}

console.log(`structural: ${STRUCTURAL_SEEDS * tiers.length} grids checked`);
for (const d of tiers) {
  const st = spreadStats.get(d.id);
  const total = st.quadHist.reduce((a, b) => a + b, 0) || 1;
  const share = st.quadHist.map(n => `${Math.round((n / total) * 100)}%`).join(" / ");
  console.log(
    `  ${d.id.padEnd(7)} nearest-pair gap avg ${(st.gapSum / st.n).toFixed(2)}` +
    ` / worst ${st.minGap}` +
    ` | crowded (<=2 apart) ${((st.tight / st.n) * 100).toFixed(1)}%` +
    ` | quad share ${share}`,
  );
  console.log(
    `          opening moves avg ${(st.openSum / st.n).toFixed(2)} of 3` +
    ` | forced (only one option) ${((st.forcedOpen / st.n) * 100).toFixed(1)}%`,
  );
}

// Solvability
const solveReport = [];
for (const d of tiers) {
  const seeds = SOLVE_SEEDS[d.id] ?? 100;
  let solved = 0, capped = 0, total = 0;
  for (let s = 0; s < seeds; s++) {
    const seed = `colorpath:solve:${d.id}:${s}`;
    const { colors, targets, obstacles } = generateGrid(d.size, d.targetCount, new Rng(seed));
    const { ok, nodes } = solve(d.size, colors, targets, obstacles);
    total += nodes;
    if (ok) solved++;
    else if (nodes > NODE_CAP) capped++;
    else fail(d.id, s, `PROVEN UNWINNABLE`);
  }
  solveReport.push(
    `  ${d.id.padEnd(7)} ${String(solved).padStart(3)}/${seeds} solved` +
    `  ${String(capped).padStart(2)} hit node cap` +
    `  avg ${Math.round(total / seeds).toLocaleString()} nodes`,
  );
}
console.log("solvability:");
for (const line of solveReport) console.log(line);

// Variety probe — distinct target+obstacle layouts, colors excluded.
for (const d of tiers) {
  const shapes = new Set();
  for (let s = 0; s < VARIETY_SEEDS; s++) {
    const { targets, obstacles } = generateGrid(d.size, d.targetCount, new Rng(`variety:${d.id}:${s}`));
    shapes.add(JSON.stringify([[...targets].sort((a, b) => a - b), obstacles]));
  }
  console.log(`variety: ${d.id.padEnd(7)} ${shapes.size}/${VARIETY_SEEDS} distinct layouts`);
}

if (failures.length === 0) {
  console.log("\n✅ ALL INVARIANTS HELD");
} else {
  console.log(`\n❌ ${failures.length} FAILURES (first 20):`);
  for (const f of failures.slice(0, 20)) console.log("  " + f);
  process.exitCode = 1;
}
