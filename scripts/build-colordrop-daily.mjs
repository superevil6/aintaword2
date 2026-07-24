// Precomputes the daily colordrop boards.
//
//   node scripts/build-colordrop-daily.mjs [--days=120] [--from=YYYY-MM-DD] [--force]
//
// Emits one immutable file per day: public/data/colordrop/<YYYY-MM-DD>.json
// holding the boards for every difficulty.
//
// WHY PRECOMPUTE — same reason as colorpath: a daily is only meaningful if
// every player gets the same boards, and freezing each day makes what ships BE
// the puzzle rather than a function of the current generator code.
//
// SOLVABILITY IS A GATE: every frozen board is re-solved here and must have
// exactly one answer matching its solutionLane before the day is written.
//
// Each set uses the seed the game itself derives for that date, so a missing
// day degrades to the identical seeded boards rather than different ones.

import { writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { solve, laneRecipe } from "../src/games/colordrop/board.js";
import { generateDailySet } from "../src/games/colordrop/generator.js";
import { DIFFICULTIES, DIFFICULTY_ORDER } from "../src/games/colordrop/difficulty.js";
import { dailySeedFor } from "../src/games/colordrop/results.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");
const outDir = path.join(root, "public/data/colordrop");

const FORMAT = 1;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const DAYS = parseInt(args.days || "120", 10);
const FROM = args.from || new Date().toISOString().slice(0, 10);
const FORCE = !!args.force;

function dayKey(from, offset) {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** Build + prove one difficulty's set for a day, or throw. */
function buildSet(day, id) {
  const count = DIFFICULTIES[id].boards;
  const set = generateDailySet(dailySeedFor(id, day), id, count);
  for (const board of set) {
    const sols = solve(board);
    if (sols.length !== 1 || sols[0] !== board.solutionLane ||
        laneRecipe(board, board.solutionLane).color !== board.goal) {
      throw new Error(`${day} ${id}: board failed the solvability gate`);
    }
  }
  return set;
}

mkdirSync(outDir, { recursive: true });

let written = 0, skipped = 0;
for (let i = 0; i < DAYS; i++) {
  const day = dayKey(FROM, i);
  const file = path.join(outDir, `${day}.json`);
  if (existsSync(file) && !FORCE) { skipped++; continue; }

  const sets = {};
  for (const id of DIFFICULTY_ORDER) sets[id] = buildSet(day, id);
  writeFileSync(file, JSON.stringify({ date: day, v: FORMAT, sets }));
  written++;
}

const all = readdirSync(outDir).filter((f) => f.endsWith(".json")).sort();
console.log(`wrote ${written} day${written === 1 ? "" : "s"}, skipped ${skipped} already present`);
if (skipped && !FORCE) console.log("(existing days are never overwritten — pass --force to rewrite)");
console.log(`archive now covers ${all.length} days: ${all[0]?.replace(".json", "")} → ${all.at(-1)?.replace(".json", "")}`);
