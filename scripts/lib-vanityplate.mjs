// Shared plate analysis for Vanity Plate's build and verify scripts.
//
// One module so the builder and the verifier judge a plate by the SAME rules —
// the familiar pool, the fairness filter, the par/birdie computation, and the
// content denylist all live here, and both scripts import them. Node-only (it
// reads SCOWL and ENABLE off disk), so it sits in scripts/ rather than src/.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { satisfies } from "../src/games/vanityplate/engine.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const scowlDir = path.join(here, "data/scowl");

// ── content denylist ─────────────────────────────────────────────────────────
//
// The plate is the ONE thing shown publicly, so a plate whose three letters
// read as a slur or profanity must never ship. This is a plain reject-list of
// three-letter strings; it is intentionally broad (we have >1000 eligible
// plates, so over-rejecting a borderline one costs nothing) and NOT exhaustive
// — add to it whenever something slips through. Matching is exact on the
// upper-cased plate, since a plate is always exactly three letters.
export const DENY = new Set(
  `ASS TIT FAG CUM JIZ JIS SHT SHZ POO PEE PIS PIZ VAG COK KOK KOX
   DIK DIC DIX DIZ COC COX NIG NGR WOP JAP KIK DYK HOE HOR
   SLT SLU SEX XXX FUK FUC FUX FCK TWT CNT CLT KKK NAZ ABO ARS
   GYP PRK PRC PHK KUM KYS KYZ JYZ SUX SUK BJZ`
    .trim()
    .split(/\s+/),
);

/** Is this three-letter plate safe to show? */
export function isCleanPlate(plate) {
  return !DENY.has(plate.toUpperCase());
}

// ── dictionaries ─────────────────────────────────────────────────────────────

const readWords = (f) =>
  readFileSync(path.join(scowlDir, f), "latin1")
    .split("\n")
    .map((w) => w.trim().toLowerCase())
    .filter((w) => /^[a-z]+$/.test(w));

/**
 * Build the pools once: the full ENABLE validity set (the same list the client
 * validates against) and the familiar par pool — SCOWL tiers 10+20 intersected
 * with ENABLE, length ≥ 3, each word's tier remembered, no stopword stripping.
 */
export function loadPools() {
  const enable = new Set(
    readFileSync(path.join(root, "public/data/dictionary.txt"), "utf8")
      .split("\n")
      .map((w) => w.trim())
      .filter(Boolean),
  );

  const famTier = new Map();
  for (const v of ["english", "american"])
    for (const w of readWords(`${v}-words.10`))
      if (w.length >= 3 && enable.has(w)) famTier.set(w, 10);
  for (const v of ["english", "american"])
    for (const w of readWords(`${v}-words.20`))
      if (w.length >= 3 && enable.has(w) && !famTier.has(w)) famTier.set(w, 20);

  const familiar = [...famTier.keys()];
  const enableArr = [...enable].filter((w) => w.length >= 3);
  return { enable, enableArr, famTier, familiar };
}

// ── per-plate analysis ───────────────────────────────────────────────────────

/** Familiar stats for a plate, or null if unsolvable in the familiar pool. */
export function analyze(plate, familiar, famTier) {
  let min = Infinity;
  let count = 0;
  const parWords = [];
  const lens = [];
  for (const w of familiar) {
    if (w.length >= 3 && satisfies(w, plate)) {
      count++;
      lens.push(w.length);
      if (w.length < min) {
        min = w.length;
        parWords.length = 0;
        parWords.push(w);
      } else if (w.length === min) {
        parWords.push(w);
      }
    }
  }
  if (!count) return null;
  lens.sort((a, b) => a - b);
  const median = lens[Math.floor(lens.length / 2)];
  const hasTier10 = parWords.some((w) => famTier.get(w) === 10);
  return { plate, par: min, parWords, hasTier10, count, median };
}

/**
 * The fairness gate, in one place: ≥2 familiar words at par length, at least
 * one of them tier 10, and the median satisfying word ≥2 longer than par.
 */
export function passesFairness(stats) {
  return stats.parWords.length >= 2 && stats.hasTier10 && stats.median - stats.par >= 2;
}

/** Shortest ENABLE word beating familiar par → the birdie length, or null. */
export function birdieLenFor(plate, par, enableArr, cache = null) {
  if (cache && cache.has(plate)) return cache.get(plate);
  let min = Infinity;
  for (const w of enableArr) {
    if (w.length < par && w.length < min && satisfies(w, plate)) min = w.length;
  }
  const val = Number.isFinite(min) ? min : null;
  if (cache) cache.set(plate, val);
  return val;
}
