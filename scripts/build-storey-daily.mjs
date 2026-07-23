// Precomputes the daily Storey hands.
//
//   node scripts/build-storey-daily.mjs [--days=122] [--from=YYYY-MM-DD] [--force] [--stats]
//
// Emits one immutable file per day: public/data/storey/<YYYY-MM-DD>.json holding,
// for every difficulty, that day's { hand, gravity, par, stories, floors }.
//
// WHY PRECOMPUTE
// A daily is only meaningful if everyone plays the same hand. Par is a max-weight
// tile matching over the curated familiar pool (see lib-storey / engine.bestTower)
// — cheap here, but it needs the ~11k familiar pool we do NOT want to ship. So we
// freeze the hand AND its par into the file; the client only needs ENABLE, which
// it already loads to validate arbitrary floor words.
//
// THE FAIRNESS GATE
// A hand is only kept when
//   • its optimal tower's storey count lands in the tier's band (Easy shortest,
//     Hard tallest — this is what keeps the three tiers ordered), AND
//   • enough DISTINCT tile pairs can bear a floor (minPairs), so there is more
//     than one way to build — a hand solvable one way only is a quiz, not a puzzle.
//
// Hands are sampled from the tier's consonant set weighted by English frequency,
// so the letters that turn up are ones a player can actually build with.
//
// IMMUTABILITY: an existing day file is never overwritten without --force.

import { writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { Rng } from "../src/core/rng.js";
import { DIFFICULTIES, DIFFICULTY_ORDER } from "../src/games/storey/difficulty.js";
import { dailySeedFor } from "../src/games/storey/results.js";
import { pillarsOf } from "../src/games/storey/engine.js";
import { loadEnable, loadFamiliarWords, parFor, playablePairs, MIN_PAIRS } from "./lib-storey.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");
const outDir = path.join(root, "public/data/storey");

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
const STATS = !!args.stats;

const ATTEMPTS = 600; // sampling tries before we take the closest near-miss

/** English consonant frequency, for sampling formable hands. */
const FREQ = {
  t: 9, n: 7, s: 6, r: 6, h: 6, l: 4, d: 4, c: 3, m: 3, p: 2,
  f: 2, g: 2, w: 2, y: 2, b: 2, v: 1, k: 1, x: 1, z: 1, j: 1, q: 1,
};

const famWords = loadFamiliarWords();
const enable = loadEnable();

/** UTC day key `offset` days after `from`. UTC so the world rolls over together. */
function dayKey(from, offset) {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** A frequency-weighted bag over a tier's allowed consonants. */
function bagFor(letters) {
  return letters.flatMap((c) => Array(FREQ[c] || 1).fill(c));
}

/** Draw `n` DISTINCT consonants from a tier's set, frequency-weighted. */
function drawDistinct(rng, bag, n) {
  const hand = [];
  while (hand.length < n) {
    const c = bag[rng.int(0, bag.length - 1)];
    if (!hand.includes(c)) hand.push(c);
  }
  return hand;
}

/**
 * Sample a hand for (day, tier) that clears the fairness gate; if none of the
 * ATTEMPTS do, keep the one whose storey count is closest to the band — a day
 * is always producible, and the gate is a preference, not a hard wall.
 */
function pickHand(day, id) {
  const d = DIFFICULTIES[id];
  const bag = bagFor(d.letters);
  const [lo, hi] = d.storeys;
  const rng = new Rng(dailySeedFor(id, day));
  let fallback = null, fallbackMiss = Infinity;

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const hand = drawDistinct(rng, bag, d.hand);
    const res = parFor(hand, d.gravity, famWords);
    const pairs = playablePairs(hand, famWords);
    const miss = Math.max(0, lo - res.stories) + Math.max(0, res.stories - hi);

    const record = { hand, res, pairs };
    if (miss === 0 && pairs >= MIN_PAIRS[id] && res.par > 0) return record;

    // Track the least-bad hand as a guaranteed fallback.
    const score = miss * 100 + Math.max(0, MIN_PAIRS[id] - pairs);
    if (score < fallbackMiss) { fallbackMiss = score; fallback = record; }
  }
  return fallback;
}

function buildSet(day, id) {
  const d = DIFFICULTIES[id];
  const { hand, res } = pickHand(day, id);
  // Sort the hand for a tidy, order-free rack display (the game re-derives cost).
  const sortedHand = hand.slice().sort();
  const floors = res.floors.map((f) => ({
    left: f.left.toUpperCase(),
    right: f.right.toUpperCase(),
    word: f.word,
    width: f.width,
  }));
  return {
    site: d.site,
    hand: sortedHand,
    gravity: d.gravity,
    par: res.par,
    stories: res.stories,
    floors,
  };
}

// ── run ──────────────────────────────────────────────────────────────────────

if (STATS) {
  // Report the par/storey distribution without writing anything.
  for (const id of DIFFICULTY_ORDER) {
    const pars = [], storeys = {}, miss = [];
    for (let i = 0; i < 120; i++) {
      const day = dayKey(FROM, i);
      const set = buildSet(day, id);
      pars.push(set.par);
      storeys[set.stories] = (storeys[set.stories] || 0) + 1;
      const [lo, hi] = DIFFICULTIES[id].storeys;
      miss.push(set.stories < lo || set.stories > hi ? 1 : 0);
    }
    pars.sort((a, b) => a - b);
    const sd = Object.keys(storeys).sort().map((k) => `${k}:${storeys[k]}`).join(" ");
    console.log(
      `${id}: par [${pars[6]}/${pars[60]}/${pars[113]}] storeys{ ${sd} } ` +
        `out-of-band ${miss.reduce((a, b) => a + b, 0)}/120`,
    );
  }
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });

// Sanity: every stored par example must be a real ENABLE word (par is reachable).
let checked = 0, bad = 0;

let written = 0, skipped = 0;
for (let i = 0; i < DAYS; i++) {
  const day = dayKey(FROM, i);
  const file = path.join(outDir, `${day}.json`);
  if (existsSync(file) && !FORCE) { skipped++; continue; }

  const sets = {};
  for (const id of DIFFICULTY_ORDER) {
    const set = buildSet(day, id);
    for (const f of set.floors) {
      checked++;
      if (!enable.has(f.word) || !pillarsOf(f.word)) bad++;
    }
    sets[id] = set;
  }
  writeFileSync(file, JSON.stringify({ date: day, v: FORMAT, sets }));
  written++;
  process.stdout.write(`\r  ${written} written (${day})   `);
}

process.stdout.write("\n");
if (bad) throw new Error(`${bad}/${checked} par example words are not valid ENABLE floors`);

const all = readdirSync(outDir).filter((f) => f.endsWith(".json")).sort();
console.log(`wrote ${written} day${written === 1 ? "" : "s"}, skipped ${skipped} already present`);
if (skipped && !FORCE) console.log("(existing days are never overwritten — pass --force to rewrite)");
console.log(
  `archive now covers ${all.length} days: ${all[0]?.replace(".json", "")} → ${all.at(-1)?.replace(".json", "")}`,
);
