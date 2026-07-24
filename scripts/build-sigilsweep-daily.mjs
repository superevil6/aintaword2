// Precomputes the daily sigilsweep puzzles.
//
//   node scripts/build-sigilsweep-daily.mjs [--days=122] [--from=YYYY-MM-DD] [--force]
//
// Emits one immutable file per day: public/data/sigilsweep/<YYYY-MM-DD>.json,
// holding the puzzles for every difficulty in the compact wire format (see
// sigil.js encodeSigil).
//
// WHY PRECOMPUTE — same reason as the other games: a daily is only meaningful
// if every player gets the same marks, and freezing each day makes what ships
// BE the puzzle rather than a function of the current generator code.
//
// SOLVABILITY IS A GATE: every frozen puzzle is decoded and re-checked here —
// the answer index must be in range, every option distinct, and the answer must
// round-trip through the wire format — before the day is written.

import { writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { generateDailySet, serializePuzzle, deserializePuzzle } from "../src/games/sigilsweep/generator.js";
import { sigilKey } from "../src/games/sigilsweep/sigil.js";
import { DIFFICULTIES, DIFFICULTY_ORDER } from "../src/games/sigilsweep/difficulty.js";
import { dailySeedFor } from "../src/games/sigilsweep/results.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");
const outDir = path.join(root, "public/data/sigilsweep");

const FORMAT = 1;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const DAYS = parseInt(args.days || "122", 10);
const FROM = args.from || new Date().toISOString().slice(0, 10);
const FORCE = !!args.force;

function dayKey(from, offset) {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** Build + prove one difficulty's set for a day, returning serialized puzzles. */
function buildSet(day, id) {
  const count = DIFFICULTIES[id].rounds;
  const set = generateDailySet(dailySeedFor(id, day), id, count);
  const out = [];
  for (const puzzle of set) {
    const wire = serializePuzzle(puzzle);
    // Prove the frozen form is sound and reconstructs the exact puzzle.
    const back = deserializePuzzle({ ...wire, t: id });
    const keys = back.options.map(sigilKey);
    if (new Set(keys).size !== keys.length) {
      throw new Error(`${day} ${id}: options are not distinct`);
    }
    if (back.answerIndex < 0 || back.answerIndex >= back.options.length) {
      throw new Error(`${day} ${id}: answer index out of range`);
    }
    if (sigilKey(back.answer) !== sigilKey(puzzle.answer)) {
      throw new Error(`${day} ${id}: answer did not round-trip through the wire format`);
    }
    out.push(wire);
  }
  return out;
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
