// Precomputes the daily Rootword puzzles.
//
//   node scripts/build-rootword-daily.mjs [--days=122] [--from=YYYY-MM-DD] [--force]
//
// Emits one immutable file per day: public/data/rootword/<YYYY-MM-DD>.json
// holding, for every difficulty, that day's { letters, seed, budget, par }.
//
// WHY PRECOMPUTE
// A daily is only meaningful if every player gets the same puzzle. Picking a
// rack at runtime makes the sequence a function of (generator code + baked
// racks), so improving either silently rewrites days people have played, and
// two players on differently-cached bundles could see different puzzles on the
// same date. Freezing the letters+seed per day into a committed file makes what
// ships BE the puzzle.
//
// Par is stored for reference/tools, but the client RECOMPUTES it from the
// shipped pool (see engine.makePuzzle / dailySet.js). Par is cheap here and the
// letters+seed are the only thing that must stay stable — recomputing means a
// par-scoping fix reaches old days too.
//
// GENERATION
// For each day + tier we seed an RNG from (date + tier), sample vowel-balanced
// letter sets, choose a seed on the set's most fertile trunk, and keep the
// first whose SEED-TRUNK par lands in the tier's band. Par is measured over the
// seed's first-letter subtree — the space the player can actually grow — via
// engine.makePuzzle, the same function the client uses, so build and runtime
// never disagree.
//
// IMMUTABILITY: an existing day file is never overwritten without --force.

import { writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { WORDS } from "../src/data/rootwordPool.js";
import { makePuzzle } from "../src/games/rootword/engine.js";
import { Rng, hashSeed } from "../src/core/rng.js";
import { dailySeedFor } from "../src/games/rootword/results.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");
const outDir = path.join(root, "public/data/rootword");

/** Format version — bump if the file shape changes so clients can detect it. */
const FORMAT = 1;

// Per tier: letter-count k, branch budget (must match difficulty.js), and the
// SEED-TRUNK par band a day must land in. Bands come from measuring the space:
// they sit inside what a fertile trunk actually yields, wide enough that a day
// is always findable, tight enough that Easy < Medium < Hard holds every day.
const TIERS = {
  easy: { k: 7, budget: 10, lo: 26, hi: 32 },
  medium: { k: 8, budget: 14, lo: 38, hi: 45 },
  hard: { k: 10, budget: 22, lo: 55, hi: 68 },
};
const ORDER = ["easy", "medium", "hard"];

const VOWELS = [..."aeiou"];
// Consonants weighted toward the useful ones, so sampled sets tend to be fertile.
const CONS = "tttnnnsssrrrlllcccdddpppmmmggghhhfffbbbwwkvyxjqz".split("");

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

function makeLetterSet(rng, k) {
  const nv = 2 + (rng.float() < 0.55 ? 1 : 0); // 2–3 vowels
  const set = new Set();
  const vs = [...VOWELS].sort(() => rng.float() - 0.5);
  for (let i = 0; i < nv && i < vs.length; i++) set.add(vs[i]);
  let guard = 0;
  while (set.size < k && guard++ < 500) set.add(rng.pick(CONS));
  return [...set].sort().join("");
}

/** A word list reachable with `letters`. */
function reachable(letters) {
  const allow = new Set(letters);
  return WORDS.filter((w) => {
    for (const c of w) if (!allow.has(c)) return false;
    return true;
  });
}

/**
 * A seed on the set's most fertile trunk: the first letter that heads the most
 * reachable words, then a deterministic 3-letter word on it. This makes the
 * seed anchor the player to a trunk worth growing, so par lands in-band often.
 */
function pickSeed(words) {
  const byFirst = new Map();
  for (const w of words) {
    if (!byFirst.has(w[0])) byFirst.set(w[0], []);
    byFirst.get(w[0]).push(w);
  }
  const trunks = [...byFirst.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  );
  for (const [, ws] of trunks) {
    const three = ws.filter((w) => w.length === 3).sort();
    if (three.length) return three[Math.floor(three.length / 2)];
  }
  const any = words.filter((w) => w.length === 3).sort();
  return any[0] || null;
}

function buildSet(day, tier) {
  const t = TIERS[tier];
  const rng = new Rng(hashSeed(`${dailySeedFor(tier, day)}:gen`));
  for (let tries = 0; tries < 6000; tries++) {
    const letters = makeLetterSet(rng, t.k);
    const words = reachable(letters);
    if (words.length < 40) continue;
    const seed = pickSeed(words);
    if (!seed) continue;
    const pz = makePuzzle({ letters, seed, budget: t.budget }, WORDS);
    if (pz.par >= t.lo && pz.par <= t.hi) {
      return { letters, seed, budget: t.budget, par: pz.par };
    }
  }
  throw new Error(`no ${tier} puzzle found for ${day} (widen the band?)`);
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
  for (const id of ORDER) sets[id] = buildSet(day, id);
  writeFileSync(file, JSON.stringify({ date: day, v: FORMAT, sets }));
  written++;
  process.stdout.write(`\r  ${written} written (${day})   `);
}

process.stdout.write("\n");
const all = readdirSync(outDir).filter((f) => f.endsWith(".json")).sort();
console.log(`wrote ${written} day${written === 1 ? "" : "s"}, skipped ${skipped} already present`);
if (skipped && !FORCE) console.log("(existing days are never overwritten — pass --force to rewrite)");
console.log(`archive now covers ${all.length} days: ${all[0]?.replace(".json", "")} → ${all.at(-1)?.replace(".json", "")}`);
