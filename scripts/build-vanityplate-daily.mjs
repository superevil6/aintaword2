// Precomputes the daily Vanity Plate courses.
//
//   node scripts/build-vanityplate-daily.mjs [--days=122] [--from=YYYY-MM-DD] [--force]
//
// Emits one immutable file per day: public/data/vanityplate/<YYYY-MM-DD>.json
// holding, for every difficulty, the HOLES plates of that day's course — plate,
// par, an example par word (for the hint), and the length of the shortest
// sub-par "birdie" word if one exists — plus the course par.
//
// WHY PRECOMPUTE
// A daily is only meaningful if everyone plays the same course. Par is the
// shortest word over the curated familiar pool (SCOWL 10+20 ∩ ENABLE), which is
// ~11k words we do NOT want to ship to the client. Computing par here freezes
// it into the file and keeps the bundle small; the client only needs ENABLE
// (already loaded, to validate arbitrary guesses).
//
// THE FAIRNESS FILTER — the load-bearing decision (measured 2026-07-22):
// half of all solvable plates have a UNIQUE familiar par word, and only ~62%
// reach par with a genuinely common (tier-10) word. A daily hole like that is a
// "know it or don't" quiz, not a puzzle. So a plate is only eligible when it has
//   • ≥2 familiar words AT par length (more than one way to hit par), AND
//   • at least one of them in tier 10 (par is reachable with a common word), AND
//   • real headroom: the median satisfying word is ≥2 longer than par (so the
//     first word you think of is usually beatable — the whole point), AND
//   • enough satisfying words overall (difficulty's minWords).
//
// NOTE: no function-word stripping, but there IS a hard length floor of 4 (see
// engine.isLegal and lib-vanityplate loadPools). A 3-letter word can only
// satisfy a 3-letter plate by BEING the plate spelled out, so it never adds a
// genuine second way to hit par — it just hands out a trivial birdie. Four+
// common words (OATH, KNEE) are the ideal answers here; three-letter words are
// suppressed everywhere, so par and birdie are both computed over length ≥ 4.
//
// IMMUTABILITY: an existing day file is never overwritten without --force, so
// regenerating after a filter change cannot alter a day already played.

import { writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { Rng } from "../src/core/rng.js";
import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  HOLES,
} from "../src/games/vanityplate/difficulty.js";
import { dailySeedFor } from "../src/games/vanityplate/results.js";
import {
  loadPools,
  analyze,
  passesFairness,
  birdieLenFor,
  isCleanPlate,
} from "./lib-vanityplate.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");
const outDir = path.join(root, "public/data/vanityplate");

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

/** UTC day key `offset` days after `from`. UTC so the world rolls over together. */
function dayKey(from, offset) {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

// ── dictionaries + per-plate analysis (shared with the verifier) ─────────────

const { enable, enableArr, famTier, familiar } = loadPools();
const birdieCache = new Map();

const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");

console.log(
  `familiar pool ${familiar.length} · ENABLE ${enable.size} — scanning ${LETTERS.length ** 3} plates…`,
);

// One eligible-plate list per difficulty band. A plate can qualify for more than
// one band's par range; per-day selection keeps the three courses distinct. A
// plate on the content denylist is dropped here so it can never be selected.
const byBand = Object.fromEntries(DIFFICULTY_ORDER.map((id) => [id, []]));
let denied = 0;
for (const a of LETTERS)
  for (const b of LETTERS)
    for (const c of LETTERS) {
      const plate = a + b + c;
      if (!isCleanPlate(plate)) {
        denied++;
        continue;
      }
      const s = analyze(plate, familiar, famTier);
      if (!s) continue;
      if (!passesFairness(s)) continue;
      for (const id of DIFFICULTY_ORDER) {
        const { parBand, minWords } = DIFFICULTIES[id];
        if (s.par >= parBand[0] && s.par <= parBand[1] && s.count >= minWords) {
          byBand[id].push(s);
        }
      }
    }
console.log(`  (${denied} plates dropped by the content denylist)`);

for (const id of DIFFICULTY_ORDER) {
  console.log(`  ${id}: ${byBand[id].length} eligible plates`);
  if (byBand[id].length < HOLES) {
    throw new Error(`Not enough eligible plates for "${id}" (need ${HOLES}).`);
  }
}

// ── selecting a course for a day ─────────────────────────────────────────────

/**
 * Pick HOLES plates for (day, difficulty): shuffle the band deterministically
 * from the day's seed, then take plates with distinct first letters so a course
 * does not read as variations on one plate. Ordered easiest-par first so the
 * course eases you in.
 */
function pickCourse(day, id) {
  const pool = byBand[id].slice();
  new Rng(dailySeedFor(id, day)).shuffle(pool);
  const chosen = [];
  const leads = new Set();
  for (const s of pool) {
    if (chosen.length >= HOLES) break;
    const lead = s.plate[0];
    if (leads.has(lead)) continue;
    leads.add(lead);
    chosen.push(s);
  }
  // Fallback in the unlikely event distinct-lead thinning left us short.
  if (chosen.length < HOLES) {
    for (const s of pool) {
      if (chosen.length >= HOLES) break;
      if (!chosen.includes(s)) chosen.push(s);
    }
  }
  chosen.sort((x, y) => x.par - y.par);

  const holes = chosen.map((s) => ({
    plate: s.plate.toUpperCase(),
    par: s.par,
    ex: s.parWords[0], // an example par word — the hint reveals its first letters
    birdie: birdieLenFor(s.plate, s.par, enableArr, birdieCache),
  }));
  const par = holes.reduce((sum, h) => sum + h.par, 0);
  return { name: DIFFICULTIES[id].course, par, holes };
}

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
  for (const id of DIFFICULTY_ORDER) sets[id] = pickCourse(day, id);
  writeFileSync(file, JSON.stringify({ date: day, v: FORMAT, sets }));
  written++;
  process.stdout.write(`\r  ${written} written (${day})   `);
}

process.stdout.write("\n");
const all = readdirSync(outDir).filter((f) => f.endsWith(".json")).sort();
console.log(`wrote ${written} day${written === 1 ? "" : "s"}, skipped ${skipped} already present`);
if (skipped && !FORCE) console.log("(existing days are never overwritten — pass --force to rewrite)");
console.log(
  `archive now covers ${all.length} days: ${all[0]?.replace(".json", "")} → ${all.at(-1)?.replace(".json", "")}`,
);
