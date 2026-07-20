// Precomputes the daily challenge sets.
//
//   node scripts/build-daily.mjs [--days=120] [--from=YYYY-MM-DD] [--force]
//
// Emits one immutable file per day: public/data/daily/<YYYY-MM-DD>.json
// containing the exact word pairs for every difficulty.
//
// WHY PRECOMPUTE
// A daily challenge is only meaningful if every player gets the same words. If
// the sequence is generated at runtime it's a function of (seed + word pool +
// dictionary + generator code) — so improving the generator silently rewrites
// today's puzzle, and two players on differently-cached bundles can see
// different words on the same day. Freezing each day into a data file makes
// what ships BE the puzzle.
//
// IMMUTABILITY: an existing day file is never overwritten. That's the whole
// point — regenerating after a generator change must not alter a day that has
// already been played. Use --force only when you deliberately intend to
// rewrite history (i.e. before launch).
//
// Files are committed to the repo so the archive is permanent and reviewable;
// you can eyeball a day, or hand-edit a bad pair, before it goes live.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { wordsForTiers } from "../src/data/commonWords.js";
import { Rng } from "../src/core/rng.js";
import { makePair } from "../src/games/aintaword/wordSmith.js";
import { DIFFICULTIES, DIFFICULTY_ORDER } from "../src/games/aintaword/difficulty.js";
import { dailySeedFor } from "../src/games/aintaword/results.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");
const outDir = path.join(root, "public/data/daily");

// Format version — bump if the file shape changes so clients can detect it.
const FORMAT = 1;
// A 60s run at a superhuman ~0.4s/answer is ~150 picks. Generous headroom so
// nobody can ever exhaust a set.
const PAIRS_PER_SET = 150;

// --- args -----------------------------------------------------------------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const DAYS = parseInt(args.days || "120", 10);
const FROM = args.from || new Date().toISOString().slice(0, 10);
const FORCE = !!args.force;

// --- dictionary + pool ----------------------------------------------------
const valid = new Set(
  readFileSync(path.join(root, "public/data/dictionary.txt"), "utf8")
    .split("\n")
    .map((w) => w.trim())
    .filter(Boolean),
);
const sources = [...new Set(wordsForTiers())];
for (const w of sources) valid.add(w);

const dict = {
  isWord: (w) => valid.has(w.toLowerCase()),
  sourcePool: ({ minLen = 0, maxLen = Infinity, tiers = null } = {}) =>
    (tiers ? wordsForTiers(tiers) : sources).filter(
      (w) => w.length >= minLen && w.length <= maxLen,
    ),
};

// --- generation -----------------------------------------------------------

/** Build one difficulty's pair list for a given day. Mirrors game.js exactly. */
function buildSet(day, id) {
  const prof = DIFFICULTIES[id];
  const rng = new Rng(dailySeedFor(id, day));
  const band = { minLen: prof.minLen, maxLen: prof.maxLen, tiers: prof.tiers };
  const pairs = [];

  for (let i = 0; i < PAIRS_PER_SET; i++) {
    let pair = makePair(dict, rng, { ...band, difficulty: prof.subtlety });
    if (!pair) {
      // Same relaxation the live game uses: loosen how similar the words may
      // look, never the length band or tier set.
      pair = makePair(dict, rng, {
        ...band,
        difficulty: prof.subtlety,
        maxLenDiff: 99,
        minDistance: 2,
        maxTries: 250,
      });
    }
    if (!pair) throw new Error(`${day}/${id}: could not generate pair ${i}`);
    pairs.push([pair.real, pair.fake]);
  }
  return pairs;
}

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

mkdirSync(outDir, { recursive: true });

let written = 0;
let skipped = 0;
for (let i = 0; i < DAYS; i++) {
  const day = addDays(FROM, i);
  const file = path.join(outDir, `${day}.json`);

  if (existsSync(file) && !FORCE) {
    skipped++;
    continue;
  }

  const sets = {};
  for (const id of DIFFICULTY_ORDER) sets[id] = buildSet(day, id);

  writeFileSync(file, JSON.stringify({ date: day, v: FORMAT, n: PAIRS_PER_SET, sets }));
  written++;
}

// --- report ---------------------------------------------------------------
const all = readdirSync(outDir).filter((f) => f.endsWith(".json")).sort();
const bytes = all.reduce((n, f) => n + readFileSync(path.join(outDir, f)).length, 0);

console.log(`from ${FROM}, ${DAYS} days, ${PAIRS_PER_SET} pairs per difficulty`);
console.log(`  written : ${written}`);
console.log(`  skipped : ${skipped} (already exist — never overwritten without --force)`);
console.log(`\narchive: ${all.length} days, ${(bytes / 1024 / 1024).toFixed(2)} MB total`);
if (all.length) {
  const one = readFileSync(path.join(outDir, all[0])).length;
  console.log(`  ${all[0]} … ${all.at(-1)}`);
  console.log(`  ~${(one / 1024).toFixed(1)} KB per day (one fetch per player per day)`);
}
