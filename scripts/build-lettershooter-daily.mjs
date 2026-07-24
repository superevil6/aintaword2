// Precomputes the daily Letter Shooter boards.
//
//   node scripts/build-lettershooter-daily.mjs [--days=122] [--from=YYYY-MM-DD] [--force] [--stats]
//
// Emits one immutable file per day: public/data/lettershooter/<YYYY-MM-DD>.json
// holding, for every difficulty, that day's { ammo, par, best }.
//
// WHY PRECOMPUTE
// The scrolling rows regenerate from the day's seed on the client, so they need
// no storage. What we freeze is PAR — the sum over five rounds of the highest-
// scoring word a perfect-timing player could reach on the seeded rows (see
// engine.bestWordForRound). Measuring it needs the full ENABLE list; freezing it
// means a later tuning change can't rewrite a day already played, and the client
// shows a target without re-running the search on load.
//
// IMMUTABILITY: an existing day file is never overwritten without --force.

import { writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { DIFFICULTIES, DIFFICULTY_ORDER } from "../src/games/lettershooter/difficulty.js";
import { dailySeedFor } from "../src/games/lettershooter/results.js";
import { buildDailySet } from "../src/games/lettershooter/engine.js";
import { loadLexicon, loadFamiliar } from "./lib-lettershooter.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");
const outDir = path.join(root, "public/data/lettershooter");

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

const lex = loadLexicon();
const familiar = loadFamiliar();

/** UTC day key `offset` days after `from`. UTC so the world rolls over together. */
function dayKey(from, offset) {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

function buildSet(day, id) {
  return buildDailySet(dailySeedFor(id, day), DIFFICULTIES[id], lex, familiar);
}

// ── run ──────────────────────────────────────────────────────────────────────

if (STATS) {
  // Report the par distribution and how often a round yields no word at all.
  for (const id of DIFFICULTY_ORDER) {
    const pars = [];
    let emptyRounds = 0, totalRounds = 0;
    for (let i = 0; i < 120; i++) {
      const set = buildSet(dayKey(FROM, i), id);
      pars.push(set.par);
      for (const b of set.best) { totalRounds++; if (!b.word) emptyRounds++; }
    }
    pars.sort((a, b) => a - b);
    console.log(
      `${id}: par [${pars[6]}/${pars[60]}/${pars[113]}]  ` +
        `empty rounds ${emptyRounds}/${totalRounds}`,
    );
  }
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });

// Sanity: every non-empty par word must be a real ENABLE word.
let checked = 0, bad = 0;

let written = 0, skipped = 0;
for (let i = 0; i < DAYS; i++) {
  const day = dayKey(FROM, i);
  const file = path.join(outDir, `${day}.json`);
  if (existsSync(file) && !FORCE) { skipped++; continue; }

  const sets = {};
  for (const id of DIFFICULTY_ORDER) {
    const set = buildSet(day, id);
    for (const b of set.best) {
      if (!b.word) continue;
      checked++;
      if (!lex.isWord(b.word)) bad++;
    }
    sets[id] = set;
  }
  writeFileSync(file, JSON.stringify({ date: day, v: FORMAT, sets }));
  written++;
  process.stdout.write(`\r  ${written} written (${day})   `);
}

process.stdout.write("\n");
if (bad) throw new Error(`${bad}/${checked} par words are not valid ENABLE words`);

const all = readdirSync(outDir).filter((f) => f.endsWith(".json")).sort();
console.log(`wrote ${written} day${written === 1 ? "" : "s"}, skipped ${skipped} already present`);
if (skipped && !FORCE) console.log("(existing days are never overwritten — pass --force to rewrite)");
console.log(
  `archive now covers ${all.length} days: ${all[0]?.replace(".json", "")} → ${all.at(-1)?.replace(".json", "")}`,
);
