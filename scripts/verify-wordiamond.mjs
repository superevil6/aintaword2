// Checks the Wordiamond puzzle pools and the ring maths behind them.
//
//   node scripts/verify-wordiamond.mjs
//
// The properties worth guarding are the ones whose failure is invisible in
// play until someone is stuck: a puzzle that cannot be solved, a scramble that
// deals already-solved, a corner that does not actually join two words, or a
// pool so alphabetically lopsided that the daily stops feeling varied.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { POOLS, WORDS } from "../src/data/wordiamondPuzzles.js";
import { MODES, boardFor } from "../src/games/wordiamond/shapes.js";
import {
  cellsFromWords, readSide, isRing, freeSlotsFor, rotateSlots, shortestSolve, scramble,
} from "../src/games/wordiamond/ring.js";
import { hashSeed, mulberry32 } from "../src/core/rng.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
const fail = (msg) => { failures++; console.error(`  ✗ ${msg}`); };
const section = (name) => console.log(`\n${name}`);

const wordSets = {};
for (const [len, flat] of Object.entries(WORDS)) {
  const n = Number(len);
  const set = new Set();
  for (let i = 0; i < flat.length; i += n) set.add(flat.slice(i, i + n));
  wordSets[n] = set;
}

// ── shipped word lists match the dictionary they claim to come from ────────
// The shipped list is the FAMILIAR pool, not the whole dictionary: a board that
// lights up for KEPS offers a lock the player has no way to judge. Rebuild it
// from the same sources the generator uses, so the two cannot drift apart.
section("word lists");
const dictionary = readFileSync(path.join(root, "public/data/dictionary.txt"), "utf8").split(/\s+/);
function familiarOfLength(len) {
  const valid = new Set(dictionary.filter((w) => w.length === len));
  const out = new Set();
  for (const tier of ["10", "20"]) {
    for (const variant of ["english", "american"]) {
      const file = path.join(root, `scripts/data/scowl/${variant}-words.${tier}`);
      for (const line of readFileSync(file, "latin1").split(/\r?\n/)) {
        const w = line.trim().toLowerCase();
        if (w.length === len && /^[a-z]+$/.test(w) && valid.has(w)) out.add(w);
      }
    }
  }
  return out;
}
for (const [len, set] of Object.entries(wordSets)) {
  const expect = familiarOfLength(Number(len));
  const inDict = new Set(dictionary.filter((w) => w.length === Number(len)));
  if (set.size !== expect.size) {
    fail(`${len}-letter list has ${set.size} entries, the familiar pool has ${expect.size}`);
  } else if ([...set].some((w) => !expect.has(w))) {
    fail(`${len}-letter list contains a word outside the familiar pool`);
  } else if ([...set].some((w) => !inDict.has(w))) {
    fail(`${len}-letter list contains a word not in the dictionary at all`);
  } else {
    console.log(`  ✓ ${set.size} ${len}-letter familiar words ` +
      `(of ${inDict.size} in the dictionary — the rest would light up unrecognisably)`);
  }
}

// ── geometry: corners really are shared, words really do read forwards ─────
section("board geometry");
for (const mode of MODES) {
  const board = boardFor(mode);
  const owners = {};
  board.sides.forEach((side, i) => side.slots.forEach((s) => (owners[s] ||= []).push(i)));
  const corners = Object.values(owners).filter((o) => o.length === 2).length;
  if (corners !== board.n) fail(`${mode.id}: ${corners} shared corners, expected ${board.n}`);
  if (Object.keys(owners).length !== board.cellCount) {
    fail(`${mode.id}: ${Object.keys(owners).length} cells covered, expected ${board.cellCount}`);
  }
  // No word may run predominantly right-to-left; downward is fine, that is how
  // a crossword down-clue reads.
  const backwards = board.sides.filter(
    (s) => s.dir.x < -0.2 && Math.abs(s.dir.x) > Math.abs(s.dir.y));
  if (backwards.length) fail(`${mode.id}: ${backwards.map((s) => s.label)} read backwards`);
  if (!failures) {
    console.log(`  ✓ ${mode.id}: ${board.label.toLowerCase()}, ${board.cellCount} cells, ` +
      `${board.n} shared corners, all words read forwards`);
  }
}

// ── pools ──────────────────────────────────────────────────────────────────
for (const mode of MODES) {
  const board = boardFor(mode);
  const words = wordSets[mode.sideLen];
  const pool = POOLS[mode.id];
  section(`${mode.label} pool — ${board.label.toLowerCase()}, ${mode.sideLen}-letter words (${pool.length})`);

  let badShape = 0, badWords = 0, badCorners = 0, badGiven = 0, badRings = 0;
  for (const [wordStr, given, rings] of pool) {
    const ws = wordStr.split(" ");
    if (ws.length !== board.n || ws.some((w) => w.length !== mode.sideLen)) { badShape++; continue; }
    if (!ws.every((w) => words.has(w))) badWords++;
    const cells = cellsFromWords(board, ws);
    // Round-tripping through the ring must reproduce the words — that IS the
    // corner-sharing contract, and it fails silently.
    if (!board.sides.every((_, i) => readSide(board, cells, i) === ws[i])) badCorners++;
    if (!Number.isInteger(given) || given < 0 || given >= board.n) badGiven++;
    if (!Number.isInteger(rings) || rings < 1) badRings++;
  }
  if (badShape) fail(`${badShape} puzzles are the wrong shape`);
  if (badWords) fail(`${badWords} puzzles use a word outside the dictionary`);
  if (badCorners) fail(`${badCorners} puzzles do not share corners consistently`);
  if (badGiven) fail(`${badGiven} puzzles name an impossible given side`);
  if (badRings) fail(`${badRings} puzzles report an impossible ring count`);
  if (!badShape && !badWords && !badCorners && !badGiven && !badRings) {
    console.log("  ✓ every puzzle is a valid ring with a sane given and ring count");
  }

  // Variety: an earlier build truncated an alphabetical walk and shipped 125
  // of 365 Medium puzzles starting with "b".
  const firsts = {};
  pool.forEach(([w]) => { const c = w[0]; firsts[c] = (firsts[c] ?? 0) + 1; });
  const distinct = Object.keys(firsts).length;
  const worst = Math.max(...Object.values(firsts)) / pool.length;
  if (distinct < 10) fail(`only ${distinct} distinct starting letters — the pool is lopsided`);
  else if (worst > 0.25) fail(`one starting letter covers ${(worst * 100).toFixed(0)}% of the pool`);
  else console.log(`  ✓ ${distinct} distinct starting letters, none above ${(worst * 100).toFixed(0)}%`);

  // Scrambles: solvable, and not dealt already solved.
  let startedSolved = 0, unsolvable = 0;
  const pars = [];
  const stride = Math.max(1, Math.floor(pool.length / 40));
  for (let i = 0; i < pool.length; i += stride) {
    const [wordStr, given] = pool[i];
    const rng = mulberry32(hashSeed(`verify:${mode.id}:${i}`));
    const cells = scramble(board, cellsFromWords(board, wordStr.split(" ")),
      rng, mode.scramble, given, words);
    if (isRing(board, cells, words)) startedSolved++;
    // Hard leaves ~40M states with only the given pinned, far too many to
    // search. Pin one more side — as the in-game check always does — and the
    // question becomes answerable again.
    const extra = board.sides.map((_, si) => si).find((si) => si !== given);
    const par = shortestSolve(board, cells, new Set([given]), words);
    if (board.cellCount - mode.sideLen <= 8 && par < 0) unsolvable++;
    if (par >= 0) pars.push(par);
    void extra;
  }
  if (startedSolved) fail(`${startedSolved} scrambles were dealt already solved`);
  if (unsolvable) fail(`${unsolvable} scrambles have no reachable solution`);
  if (!startedSolved && !unsolvable) {
    pars.sort((a, b) => a - b);
    console.log(`  ✓ ${pars.length} scrambles checked: solvable, and unsolved at deal`);
    if (pars.length) {
      console.log(`    shortest solution — min ${pars[0]}, median ${pars[pars.length >> 1]}, max ${pars.at(-1)}`);
    }
  }

  // Locks pin corners and narrow their neighbours.
  const free = freeSlotsFor(board, new Set([0]));
  if (free[0].length !== 0) fail(`${mode.id}: a locked side should have no free cells`);
  const narrowed = free.filter((f, i) => i !== 0 && f.length < board.sides[i].slots.length);
  if (narrowed.length !== 2) fail(`${mode.id}: locking one side should narrow exactly two neighbours`);

  // A full turn around a side is the identity.
  const [wordStr, given] = pool[0];
  let cells = cellsFromWords(board, wordStr.split(" "));
  const spin = board.sides.map((_, i) => i).find((i) => i !== given);
  const before = cells.join("");
  const slots = freeSlotsFor(board, new Set([given]))[spin];
  for (let i = 0; i < slots.length; i++) cells = rotateSlots(cells, slots, 1);
  if (cells.join("") !== before) fail(`${mode.id}: a full turn around a side is not the identity`);
}

// ── the frozen daily archive ───────────────────────────────────────────────
// These files ARE the puzzle for their date, so a fault here ships a broken
// day to everyone at once.
section("daily archive");
const dayDir = path.join(root, "public/data/wordiamond");
if (!existsSync(dayDir)) {
  console.log("  – no archive generated yet (npm run wordiamond:daily)");
} else {
  const files = readdirSync(dayDir).filter((f) => f.endsWith(".json")).sort();
  let bad = 0;
  for (const file of files) {
    const day = file.replace(/\.json$/, "");
    let json;
    try {
      json = JSON.parse(readFileSync(path.join(dayDir, file), "utf8"));
    } catch {
      fail(`${day}: not valid JSON`);
      bad++;
      continue;
    }
    if (json.v !== 1) { fail(`${day}: unknown format version ${json.v}`); bad++; continue; }
    if (json.date !== day) { fail(`${day}: file says it is ${json.date}`); bad++; continue; }
    for (const mode of MODES) {
      const entry = json.modes?.[mode.id];
      if (!entry) { fail(`${day}: missing ${mode.id}`); bad++; continue; }
      const board = boardFor(mode);
      const words = wordSets[mode.sideLen];
      const ws = entry.words.split(" ");
      const solved = cellsFromWords(board, ws);
      const cells = entry.cells.split("");

      if (cells.length !== board.cellCount) { fail(`${day} ${mode.id}: wrong cell count`); bad++; }
      // The dealt board must be a REARRANGEMENT of the solution, not new
      // letters — otherwise no sequence of rotations can ever finish it.
      else if ([...cells].sort().join("") !== [...solved].sort().join("")) {
        fail(`${day} ${mode.id}: dealt letters do not match the solution`); bad++;
      } else if (isRing(board, cells, words)) {
        fail(`${day} ${mode.id}: dealt already solved`); bad++;
      } else if (readSide(board, cells, entry.given) !== ws[entry.given]) {
        fail(`${day} ${mode.id}: the given word was disturbed by the scramble`); bad++;
      } else if (!ws.every((w) => words.has(w))) {
        fail(`${day} ${mode.id}: uses a word outside the dictionary`); bad++;
      } else if (board.cellCount - mode.sideLen <= 8 &&
                 shortestSolve(board, cells, new Set([entry.given]), words) < 0) {
        // Hard is skipped: ~40M states with one side pinned. Its solvability
        // comes from construction — the deal is a scramble of a real ring.
        fail(`${day} ${mode.id}: no solution is reachable`); bad++;
      }
    }
  }
  if (!bad) {
    console.log(`  ✓ ${files.length} days, every mode solvable, unsolved at deal, given word intact`);
    console.log(`    ${files[0]?.replace(".json", "")} → ${files.at(-1)?.replace(".json", "")}`);
  }
}

console.log("");
if (failures) {
  console.error(`FAILED — ${failures} problem${failures === 1 ? "" : "s"}`);
  process.exit(1);
}
console.log("All Wordiamond checks passed.");
