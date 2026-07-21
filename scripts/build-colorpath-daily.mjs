// Precomputes the daily Color Path boards.
//
//   node scripts/build-colorpath-daily.mjs [--days=30] [--from=YYYY-MM-DD] [--force]
//
// Emits one immutable file per day: public/data/colorpath/<YYYY-MM-DD>.json
// holding the exact layout for every difficulty.
//
// WHY PRECOMPUTE
// A daily is only meaningful if every player gets the same board. Generated at
// runtime the board is a function of (seed + generator code), so any change to
// the generator silently rewrites today's puzzle, and two players on
// differently-cached bundles can be handed different boards on the same date.
// Freezing each day into a data file makes what ships BE the puzzle.
//
// IMMUTABILITY: an existing day file is never overwritten. That is the whole
// point — regenerating after a generator change must not alter a day already
// played. Use --force only when deliberately rewriting history, i.e. before
// launch.
//
// SOLVABILITY IS A GATE, NOT A HOPE. A frozen board that cannot be finished
// would ship to every player at once, with no runtime regeneration to save
// them. Every layout is brute-force solved here before it is written, using
// the same search as scripts/verify-colorpath.mjs.
//
// Each board uses the seed the game itself would derive for that date, so a
// day whose file is missing degrades to the identical board rather than a
// different one.

import { writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { Rng } from "../src/core/rng.js";
import { generateGrid } from "../src/games/colorpath/generator.js";
import { DIFFICULTIES, DIFFICULTY_ORDER } from "../src/games/colorpath/difficulty.js";
import { dailySeedFor } from "../src/games/colorpath/results.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");
const outDir = path.join(root, "public/data/colorpath");

/** Format version — bump if the file shape changes so clients can detect it. */
const FORMAT = 1;
const PRIMARIES = [1, 2, 4];
// Far above the verifier's cap: this runs once at build time, so it can afford
// to be sure. Hard boards average ~110k nodes; a handful need far more.
const NODE_CAP = 60_000_000;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const DAYS = parseInt(args.days || "30", 10);
const FROM = args.from || new Date().toISOString().slice(0, 10);
const FORCE = !!args.force;

/** UTC day key `offset` days after `from`. UTC so the world rolls over together. */
function dayKey(from, offset) {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

// ── solvability, mirroring scripts/verify-colorpath.mjs ────────────────────

function neighbors(i, N) {
  const r = Math.floor(i / N);
  const c = i % N;
  const out = [];
  if (r > 0) out.push(i - N);
  if (r < N - 1) out.push(i + N);
  if (c > 0) out.push(i - 1);
  if (c < N - 1) out.push(i + 1);
  return out;
}

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
      const want = (colors[pos] ^ bit) & 0b111;
      const moves = neighbors(pos, N)
        .filter((n) => colors[n] === want && !burned.has(n) && !obs.has(n))
        .sort((a, b) => a - b);
      for (const n of moves) {
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

// ── generation ─────────────────────────────────────────────────────────────

/**
 * Build one difficulty's board for a day. Mirrors game.js `_build()`.
 * @returns the board, or null if it could not be proven finishable.
 */
function buildBoard(day, id) {
  const prof = DIFFICULTIES[id];
  const rng = new Rng(dailySeedFor(id, day));
  const { colors, targets, obstacles } = generateGrid(prof.size, prof.targetCount, rng);

  if (colors.length !== prof.size * prof.size || colors.some((c) => c < 0)) {
    throw new Error(`${day} ${id}: generator left the board incomplete`);
  }

  const { ok, nodes } = solve(prof.size, colors, targets, obstacles);
  if (ok) return { size: prof.size, colors, targets: [...targets], obstacles: [...obstacles] };

  // Unproven, so it does not get frozen — but this must not abort the run and
  // leave the archive half-built. Skipping the day leaves a gap, and a gap
  // falls back to generating from the seed, which is exactly what the game did
  // before any of this existed. Strictly no worse than the status quo, and the
  // gap is reported rather than hidden.
  const why = nodes > NODE_CAP ? `search capped at ${NODE_CAP.toLocaleString()} nodes` : "proven unwinnable";
  console.warn(`  ! ${day} ${id}: ${why} — leaving this day unfrozen`);
  return null;
}

mkdirSync(outDir, { recursive: true });

let written = 0;
let skipped = 0;
const unproven = [];
for (let i = 0; i < DAYS; i++) {
  const day = dayKey(FROM, i);
  const file = path.join(outDir, `${day}.json`);
  if (existsSync(file) && !FORCE) {
    skipped++;
    continue;
  }
  const sets = {};
  let complete = true;
  for (const id of DIFFICULTY_ORDER) {
    const board = buildBoard(day, id);
    if (!board) { complete = false; break; }
    sets[id] = board;
  }
  // All difficulties or none: a file missing one tier would send that tier
  // down the fallback path while its neighbours came from the archive.
  if (!complete) { unproven.push(day); continue; }
  writeFileSync(file, JSON.stringify({ date: day, v: FORMAT, sets }));
  written++;
}

const all = readdirSync(outDir).filter((f) => f.endsWith(".json")).sort();
console.log(`wrote ${written} day${written === 1 ? "" : "s"}, skipped ${skipped} already present`);
if (unproven.length) {
  console.log(`${unproven.length} day(s) left unfrozen (they fall back to seeded generation): ${unproven.join(", ")}`);
}
if (skipped && !FORCE) console.log("(existing days are never overwritten — pass --force to rewrite)");
console.log(`archive now covers ${all.length} days: ${all[0]?.replace(".json", "")} → ${all.at(-1)?.replace(".json", "")}`);
