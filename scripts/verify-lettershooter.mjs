// Verifies every shipped Letter Shooter daily against the rules that made it.
//
//   node scripts/verify-lettershooter.mjs
//
// The e2e test drives the controller; this re-derives the DATA guarantees from
// the seed + familiar pool, so a hand-edited file, a stale build, or a tuning
// change never re-run is caught before it reaches a player. For every tier of
// every day it re-checks, from scratch:
//
//   • format version and date match the filename;
//   • the five ammo letters and the par re-derived from the seed match the file;
//   • each stored best word IS a real, FAMILIAR word that scores what's stored;
//   • each best word is genuinely REACHABLE on the seeded board — it starts with
//     the round's ammo, every letter appears in its row, and every prefix stays
//     alive — so par is a ceiling the board actually admits.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { DIFFICULTIES, DIFFICULTY_ORDER } from "../src/games/lettershooter/difficulty.js";
import { dailySeedFor } from "../src/games/lettershooter/results.js";
import { ammoAt, rowAt, scoreWord, buildDailySet, MIN_WORD } from "../src/games/lettershooter/engine.js";
import { loadLexicon, loadFamiliar } from "./lib-lettershooter.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(dir, "..", "public/data/lettershooter");

const lex = loadLexicon();
const familiar = loadFamiliar();

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
    const profile = DIFFICULTIES[id];
    const seed = dailySeedFor(id, day);

    // Re-derive the whole set from the seed + familiar pool and match.
    const re = buildDailySet(seed, profile, lex, familiar);
    ok(re.par === set.par, `${day}/${id}: stored par ${set.par} == re-derived ${re.par}`);
    ok(JSON.stringify(re.ammo) === JSON.stringify(set.ammo), `${day}/${id}: ammo letters match`);
    ok(JSON.stringify(re.best) === JSON.stringify(set.best), `${day}/${id}: best words match`);

    ok(set.ammo.length === profile.rounds, `${day}/${id}: ${profile.rounds} ammo letters`);
    ok(set.best.length === profile.rounds, `${day}/${id}: ${profile.rounds} best entries`);
    ok(set.par === set.best.reduce((s, b) => s + b.score, 0), `${day}/${id}: par == sum of best scores`);

    // Each best word: real, familiar, correctly scored, and reachable on the board.
    for (let r = 0; r < set.best.length; r++) {
      const w = String(set.best[r].word).toLowerCase();
      if (!w) { ok(set.best[r].score === 0, `${day}/${id}/R${r}: empty round scores 0`); continue; }
      ok(lex.isWord(w), `${day}/${id}/R${r}: "${w}" is a real word`);
      ok(familiar.has(w), `${day}/${id}/R${r}: "${w}" is a familiar word`);
      ok(w.length >= MIN_WORD, `${day}/${id}/R${r}: "${w}" is at least ${MIN_WORD} letters`);
      ok(scoreWord(w.length) === set.best[r].score, `${day}/${id}/R${r}: "${w}" scores ${set.best[r].score}`);
      ok(w[0] === ammoAt(seed, r), `${day}/${id}/R${r}: "${w}" starts with the round's ammo`);
      // reachable: each letter is in its row, and every prefix is alive
      let reachable = true;
      for (let k = 1; k < w.length; k++) {
        const row = rowAt(seed, r, k - 1, profile);
        if (!row.letters.includes(w[k]) || !lex.isPrefix(w.slice(0, k + 1))) { reachable = false; break; }
      }
      ok(reachable, `${day}/${id}/R${r}: "${w}" threads the seeded rows`);
    }
  }
}

console.log(`\nLetter Shooter verify: ${pass} passed, ${fail} failed · ${files.length} days`);
process.exit(fail ? 1 : 0);
