// Verifies every shipped Storey daily against the rules that generated it.
//
//   node scripts/verify-storey.mjs
//
// The e2e test drives the controller; this re-derives the DATA guarantees from
// the familiar pool, so a hand-edited file, a stale build, or a tuning change
// never re-run is caught before it reaches a player. For every tier of every
// day it re-checks, from scratch:
//
//   • the hand is the tier's size, drawn only from the tier's consonants;
//   • par + storey count re-derived from the familiar table match the file;
//   • the stored optimal floors ARE optimal: each is a real ENABLE word,
//     bookended by two consonants, its width is its length, its pillars are the
//     stored ones, and their widths minus the tower's gravity equal par;
//   • the floors only spend tiles the hand actually holds (no tile used twice);
//   • the storey count sits in the tier's band and enough distinct pairs are
//     playable (the fairness gate).

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  VOWELS,
  pillarsOf,
  scoreTower,
  rackFromHand,
  rackAffords,
  isConsonant,
} from "../src/games/storey/engine.js";
import { DIFFICULTIES, DIFFICULTY_ORDER } from "../src/games/storey/difficulty.js";
import {
  loadEnable,
  loadFamiliarWords,
  parFor,
  playablePairs,
  MIN_PAIRS,
} from "./lib-storey.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(dir, "..", "public/data/storey");

const enable = loadEnable();
const famWords = loadFamiliarWords();

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) pass++;
  else { fail++; console.log(`  ✗ ${msg}`); }
};

const files = readdirSync(dataDir)
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .sort();

for (const file of files) {
  const day = file.replace(".json", "");
  const data = JSON.parse(readFileSync(path.join(dataDir, file), "utf8"));
  ok(data.v === 1, `${day}: format version 1`);
  ok(data.date === day, `${day}: date field matches filename`);

  for (const id of DIFFICULTY_ORDER) {
    const set = data.sets?.[id];
    ok(set, `${day}/${id}: set present`);
    if (!set) continue;
    const d = DIFFICULTIES[id];
    const letters = new Set(d.letters);

    ok(set.site === d.site, `${day}/${id}: site name`);
    ok(set.gravity === d.gravity, `${day}/${id}: gravity ${d.gravity}`);
    ok(set.hand.length === d.hand, `${day}/${id}: hand size ${d.hand}`);
    ok(set.hand.every((t) => isConsonant(t) && letters.has(t)),
      `${day}/${id}: hand is tier consonants only`);
    ok(new Set(set.hand).size === set.hand.length, `${day}/${id}: hand letters are distinct`);
    const handSet = new Set(set.hand);

    // Re-derive par + storeys from the hand's own filtered table and match.
    const re = parFor(set.hand, set.gravity, famWords);
    ok(re.par === set.par, `${day}/${id}: stored par ${set.par} == re-derived ${re.par}`);
    ok(re.stories === set.stories, `${day}/${id}: stored storeys ${set.stories} == re-derived ${re.stories}`);

    const [lo, hi] = d.storeys;
    ok(set.stories >= lo && set.stories <= hi, `${day}/${id}: storeys ${set.stories} in band ${lo}-${hi}`);
    ok(playablePairs(set.hand, famWords) >= MIN_PAIRS[id], `${day}/${id}: ≥${MIN_PAIRS[id]} playable pairs`);

    // Stored optimal floors: real, bookended, built only from the hand, affordable.
    ok(Array.isArray(set.floors) && set.floors.length === set.stories,
      `${day}/${id}: ${set.stories} optimal floors listed`);
    const rack = rackFromHand(set.hand);
    for (const f of set.floors || []) {
      const w = String(f.word).toLowerCase();
      ok(enable.has(w), `${day}/${id}: floor "${w}" is a real word`);
      const p = pillarsOf(w);
      ok(p, `${day}/${id}: floor "${w}" is bookended by consonants`);
      if (!p) continue;
      ok(f.width === p.width, `${day}/${id}: floor "${w}" width ${f.width} == length`);
      ok(f.left.toLowerCase() === p.left && f.right.toLowerCase() === p.right,
        `${day}/${id}: floor "${w}" pillars match ${f.left}/${f.right}`);
      ok([...w].every((c) => VOWELS.has(c) || handSet.has(c)),
        `${day}/${id}: floor "${w}" is spelled only from the hand + vowels`);
      ok(rackAffords(rack, p.left, p.right), `${day}/${id}: floor "${w}" pillars still un-spent`);
      rack[p.left]--; rack[p.right]--;
    }
    // widths − tower gravity == par (the floors really do score par).
    ok(scoreTower((set.floors || []).map((f) => ({ width: f.width })), set.gravity) === set.par,
      `${day}/${id}: optimal floors score exactly par ${set.par}`);
  }
}

console.log(
  `\nStorey verify: ${pass} passed, ${fail} failed · ${files.length} days`,
);
process.exit(fail ? 1 : 0);
