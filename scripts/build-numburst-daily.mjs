// Precomputes the daily Numburst matches.
//
//   node scripts/build-numburst-daily.mjs [--days=122] [--from=YYYY-MM-DD] [--force]
//
// Emits one immutable file per day: public/data/numburst/<YYYY-MM-DD>.json
// holding, for every difficulty, the ROUNDS boards of that day's match plus a
// par score.
//
// WHY PRECOMPUTE
// A daily is only meaningful if every player gets the same match. Generated at
// runtime the boards are a function of (seed + generator code), so any change
// to the generator silently rewrites today's match, and two players on
// differently-cached bundles can be handed different boards on the same date.
// Freezing each day into a data file makes what ships BE the match.
//
// It also moves the cost off the client. Generating a Hard board takes several
// seconds — a settle-to-fixpoint physics pass — which is fine offline and a
// visible hang in a phone browser. Baking is what makes Hard playable at all.
//
// IMMUTABILITY: an existing day file is never overwritten without --force. That
// is the point — regenerating after a tuning change must not alter a day
// already played.
//
// No solvability gate is needed the way Color Path needs one: every Numburst
// board is playable by construction (you can always spend a bomb). What is
// computed here instead is PAR — see parFor().

import { writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { Rng } from "../src/core/rng.js";
import { generateBoard, detonate, bombsLeft } from "../src/games/numburst/board.js";
import { DIFFICULTIES, DIFFICULTY_ORDER, ROUNDS } from "../src/games/numburst/difficulty.js";
import { dailySeedFor } from "../src/games/numburst/results.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");
const outDir = path.join(root, "public/data/numburst");

/** Format version — bump if the file shape changes so clients can detect it. */
const FORMAT = 1;

/**
 * Par as a fraction of the greedy reference score.
 *
 * The reference is what a "take the biggest cascade every turn" heuristic
 * scores — strong, careful play, and stronger than a human eyeballing 170 orbs.
 * Par is set BELOW it on purpose: it should be a target a moderately careful
 * player clears and a good player beats comfortably, not a wall. At 0.6 a
 * player matching the heuristic finishes at ~1.7x par, which reads as a win
 * rather than a near-miss. Raise it to make par sterner, lower it to make it
 * gentler; it is the one number that sets how the day feels.
 */
const PAR_FRACTION = 0.6;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const DAYS = parseInt(args.days || "122", 10);
const FROM = args.from || new Date().toISOString().slice(0, 10);
const FORCE = !!args.force;

/** UTC day key `offset` days after `from`. UTC so the world rolls over together. */
function dayKey(from, offset) {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

// ── par, via a greedy reference run ──────────────────────────────────────────

/**
 * Greedy score for one board: each turn, take the highest-scoring shot
 * available, then let the pile collapse — exactly the game's dynamics. Moves
 * are EVALUATED on the frozen board (cheap, no collapse) and only the committed
 * move pays for a collapse.
 */
function greedyRound(board) {
  let bd = board;
  let score = 0;
  while (bombsLeft(bd) > 0) {
    let best = { s: -1 };
    for (const [v, c] of Object.entries(bd.bombs)) {
      if (!c) continue;
      for (const o of bd.orbs) {
        if (!o.alive) continue;
        const r = detonate(bd, o.id, +v, { settleAfter: false });
        if (r.score > best.s) best = { s: r.score, v: +v, id: o.id };
      }
    }
    if (best.s < 0) break;
    const r = detonate(bd, best.id, best.v); // commit, with the real collapse
    bd = r.board;
    score += r.score;
  }
  return score;
}

// ── generation ───────────────────────────────────────────────────────────────

/** Reconstruct exactly what game.js `_build()` produces for (day, difficulty, round). */
function roundBoard(day, id, round) {
  const seed = `${dailySeedFor(id, day)}:r${round}`;
  return generateBoard(DIFFICULTIES[id], new Rng(seed));
}

/** Build one difficulty's whole match: ROUNDS boards plus par. */
function buildSet(day, id) {
  const rounds = [];
  let reference = 0;
  for (let r = 0; r < ROUNDS; r++) {
    const board = roundBoard(day, id, r);
    reference += greedyRound(board);
    rounds.push({
      size: round2(board.size),
      bombs: { ...board.bombs },
      // Flat [x, y, value] per orb; radius and id are derived on load, so the
      // file carries only what cannot be recomputed.
      orbs: board.orbs.map((o) => [round2(o.x), round2(o.y), o.value]),
    });
  }
  return { par: Math.round(reference * PAR_FRACTION), rounds };
}

const round2 = (n) => Math.round(n * 100) / 100;

// ── run ──────────────────────────────────────────────────────────────────────

mkdirSync(outDir, { recursive: true });

let written = 0;
let skipped = 0;
for (let i = 0; i < DAYS; i++) {
  const day = dayKey(FROM, i);
  const file = path.join(outDir, `${day}.json`);
  if (existsSync(file) && !FORCE) {
    skipped++;
    continue;
  }
  const sets = {};
  for (const id of DIFFICULTY_ORDER) sets[id] = buildSet(day, id);
  writeFileSync(file, JSON.stringify({ date: day, v: FORMAT, sets }));
  written++;
  process.stdout.write(`\r  ${written} written (${day})   `);
}

process.stdout.write("\n");
const all = readdirSync(outDir).filter((f) => f.endsWith(".json")).sort();
console.log(`wrote ${written} day${written === 1 ? "" : "s"}, skipped ${skipped} already present`);
if (skipped && !FORCE) console.log("(existing days are never overwritten — pass --force to rewrite)");
console.log(`archive now covers ${all.length} days: ${all[0]?.replace(".json", "")} → ${all.at(-1)?.replace(".json", "")}`);
