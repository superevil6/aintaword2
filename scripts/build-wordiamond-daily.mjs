// Precomputes the daily Wordiamond boards.
//
//   node scripts/build-wordiamond-daily.mjs [--days=30] [--from=YYYY-MM-DD] [--force]
//
// Emits one immutable file per day: public/data/wordiamond/<YYYY-MM-DD>.json
// holding the exact starting arrangement for every difficulty.
//
// WHY PRECOMPUTE
// A daily is only meaningful if every player gets the same board. Generated at
// runtime, the board is a function of (seed + pool + scramble code), so
// improving any of those silently rewrites today's puzzle, and two players on
// differently-cached bundles can be handed different boards on the same date.
// Freezing each day into a data file makes what ships BE the puzzle.
//
// IMMUTABILITY: an existing day file is never overwritten. That is the whole
// point — regenerating after a change must not alter a day already played. Use
// --force only when deliberately rewriting history, i.e. before launch.
//
// Files are committed, so the archive is permanent and reviewable: you can
// eyeball a day, or hand-fix a bad board, before it goes live.
//
// The chosen puzzle and its scramble use the same seeds the game would derive
// for that date, so a day whose file is missing degrades to the identical
// board rather than a different one.

import { writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { POOLS, WORDS } from "../src/data/wordiamondPuzzles.js";
import { MODES, boardFor } from "../src/games/wordiamond/shapes.js";
import { cellsFromWords, scramble, isRing, readSide } from "../src/games/wordiamond/ring.js";
import { hashSeed, mulberry32 } from "../src/core/rng.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");
const outDir = path.join(root, "public/data/wordiamond");

/** Format version — bump if the file shape changes so clients can detect it. */
const FORMAT = 1;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const DAYS = parseInt(args.days || "30", 10);
const FROM = args.from || new Date().toISOString().slice(0, 10);
const FORCE = !!args.force;

const wordSets = {};
for (const [len, flat] of Object.entries(WORDS)) {
  const n = Number(len);
  const set = new Set();
  for (let i = 0; i < flat.length; i += n) set.add(flat.slice(i, i + n));
  wordSets[n] = set;
}

/** UTC day key `days` after `from`. UTC so the world rolls over together. */
function dayKey(from, offset) {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** Build one mode's board for a day. Mirrors what game.js would derive. */
function buildBoardFor(mode, day) {
  const board = boardFor(mode);
  const pool = POOLS[mode.id];
  const words = wordSets[mode.sideLen];

  const index = hashSeed(`wordiamond:${mode.id}:${day}`) % pool.length;
  const [wordStr, given, rings] = pool[index];
  const solved = cellsFromWords(board, wordStr.split(" "));
  const rng = mulberry32(hashSeed(`wordiamond:${mode.id}:${day}:scramble`));
  const cells = scramble(board, solved, rng, mode.scramble, given, words);

  // Two things must hold for every shipped day, and both fail silently:
  // the board must not be dealt already solved, and the given word must have
  // survived the scramble intact.
  if (isRing(board, cells, words)) {
    throw new Error(`${day} ${mode.id}: dealt already solved`);
  }
  if (readSide(board, cells, given) !== wordStr.split(" ")[given]) {
    throw new Error(`${day} ${mode.id}: the given word was disturbed`);
  }

  return { words: wordStr, given, rings, cells: cells.join("") };
}

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
  const modes = {};
  for (const mode of MODES) modes[mode.id] = buildBoardFor(mode, day);
  writeFileSync(file, JSON.stringify({ date: day, v: FORMAT, modes }));
  written++;
}

const all = readdirSync(outDir).filter((f) => f.endsWith(".json")).sort();
console.log(`wrote ${written} day${written === 1 ? "" : "s"}, skipped ${skipped} already present`);
if (skipped && !FORCE) console.log("(existing days are never overwritten — pass --force to rewrite)");
console.log(`archive now covers ${all.length} days: ${all[0]?.slice(0, 10)} → ${all.at(-1)?.slice(0, 10)}`);
