// Verifies every shipped Vanity Plate daily against the rules that generated it.
//
//   node scripts/verify-vanityplate.mjs
//
// The e2e test drives the controller; this re-derives the DATA guarantees from
// the dictionaries, so a hand-edited file, a stale build, or a filter change
// that was never re-run is caught before it reaches a player. For every hole of
// every day it re-checks, from scratch:
//
//   • the plate is three letters and NOT on the content denylist;
//   • par equals the shortest familiar word, and sits in the tier's par band;
//   • the fairness gate still holds (≥2 familiar par words, one tier-10,
//     median ≥2 over par, enough words for the tier);
//   • the example word is a real, par-length word that actually satisfies the
//     plate (so the hint never lies and par is always reachable);
//   • the stored birdie length is exactly the shortest ENABLE word beating par;
//   • the course is HOLES holes with distinct first letters, and its par is the
//     sum of the holes.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { satisfies } from "../src/games/vanityplate/engine.js";
import { DIFFICULTIES, DIFFICULTY_ORDER, HOLES } from "../src/games/vanityplate/difficulty.js";
import {
  loadPools,
  analyse,
  passesFairness,
  birdieLenFor,
  isCleanPlate,
} from "./lib-vanityplate.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(dir, "..", "public/data/vanityplate");

const { enable, enableArr, famTier, familiar } = loadPools();
const analyseCache = new Map();
const birdieCache = new Map();
const statsFor = (plate) => {
  if (!analyseCache.has(plate)) analyseCache.set(plate, analyse(plate, familiar, famTier));
  return analyseCache.get(plate);
};

let pass = 0;
let fail = 0;
const seen = { plates: new Set() };
const ok = (cond, msg) => {
  if (cond) pass++;
  else {
    fail++;
    console.log(`  ✗ ${msg}`);
  }
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
    ok(set, `${day}/${id}: course present`);
    if (!set) continue;

    ok(set.name === DIFFICULTIES[id].course, `${day}/${id}: course name`);
    ok(set.holes.length === HOLES, `${day}/${id}: ${HOLES} holes`);

    const [lo, hi] = DIFFICULTIES[id].parBand;
    const minWords = DIFFICULTIES[id].minWords;
    const leads = new Set();
    let parSum = 0;

    for (const h of set.holes) {
      const plate = h.plate;
      const lc = plate.toLowerCase();
      seen.plates.add(plate);
      parSum += h.par;
      leads.add(plate[0]);

      ok(/^[A-Z]{3}$/.test(plate), `${day}/${id} ${plate}: three uppercase letters`);
      ok(isCleanPlate(plate), `${day}/${id} ${plate}: not on the content denylist`);

      const s = statsFor(lc);
      ok(s, `${day}/${id} ${plate}: solvable in the familiar pool`);
      if (!s) continue;

      ok(h.par === s.par, `${day}/${id} ${plate}: stored par == shortest familiar (${s.par})`);
      ok(h.par >= lo && h.par <= hi, `${day}/${id} ${plate}: par ${h.par} in band ${lo}-${hi}`);
      ok(s.count >= minWords, `${day}/${id} ${plate}: ${s.count} words ≥ ${minWords}`);
      ok(passesFairness(s), `${day}/${id} ${plate}: passes the fairness gate`);

      ok(satisfies(h.ex, lc), `${day}/${id} ${plate}: example "${h.ex}" satisfies the plate`);
      ok(enable.has(h.ex), `${day}/${id} ${plate}: example "${h.ex}" is a real word`);
      ok(h.ex.length === h.par, `${day}/${id} ${plate}: example is par-length`);
      ok(s.parWords.includes(h.ex), `${day}/${id} ${plate}: example is an actual par word`);

      const birdie = birdieLenFor(lc, h.par, enableArr, birdieCache);
      ok(
        (h.birdie ?? null) === birdie,
        `${day}/${id} ${plate}: birdie ${h.birdie ?? "null"} == shortest sub-par ENABLE (${birdie ?? "null"})`,
      );
    }

    ok(parSum === set.par, `${day}/${id}: hole pars sum to course par (${set.par})`);
    ok(leads.size === set.holes.length, `${day}/${id}: holes have distinct first letters`);
  }
}

// A denylisted plate must never appear anywhere in the archive.
const dirty = [...seen.plates].filter((p) => !isCleanPlate(p));
ok(dirty.length === 0, `no denylisted plate appears in any daily (found: ${dirty.join(", ") || "none"})`);

console.log(
  `\nVanity Plate verify: ${pass} passed, ${fail} failed · ` +
    `${files.length} days, ${seen.plates.size} distinct plates`,
);
process.exit(fail ? 1 : 0);
