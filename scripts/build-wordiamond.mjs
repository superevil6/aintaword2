// Generates src/data/wordiamondPuzzles.js — the Wordiamond puzzle pools.
//
//   node scripts/build-wordiamond.mjs [--count=365]
//
// A puzzle is a ring of words around an N-gon, adjacent sides SHARING their
// corner letter, each word read in whichever direction keeps it upright and
// forwards on screen (see shapes.js). One side is handed to the player already
// solved: it makes the puzzle unstrandable by construction and small enough to
// answer questions about exhaustively.
//
// Three modes, chosen by measuring the whole reachable state space rather than
// by feel — see MODES in shapes.js for the depth and darkness figures.
//
// Sources: SCOWL (scripts/data/scowl/) for familiarity, intersected with the
// ENABLE list in public/data/dictionary.txt for validity. Licensing note as
// per build-words.mjs — see scripts/data/scowl/COPYRIGHT.
//
// Why generate rather than search at runtime: a daily puzzle only means
// anything if every player gets the identical board, and freezing the pools
// into a committed file makes the sequence a function of the file rather than
// of whichever generator version happens to be in someone's cached bundle.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { MODES, boardFor } from "../src/games/wordiamond/shapes.js";
import { cellsFromWords, countRings, indexWords } from "../src/games/wordiamond/ring.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const COUNT = Number(args.count ?? 365);

// SCOWL size tiers: 10 is the most common English vocabulary, 20 common but
// less so. Tier 35 is deliberately excluded — a player has to recognise these
// as words while the board churns, and 35 admits too much that merely looks
// plausible.
const TIERS = ["10", "20"];
const VARIANTS = ["english", "american"];
const VOWELS = new Set(["a", "e", "i", "o", "u"]);

const dictionary = readFileSync(path.join(root, "public/data/dictionary.txt"), "utf8").split(/\s+/);

function wordsOfLength(len) {
  const valid = new Set(dictionary.filter((w) => w.length === len));
  const familiar = new Set();
  for (const tier of TIERS) {
    for (const variant of VARIANTS) {
      const file = path.join(root, `scripts/data/scowl/${variant}-words.${tier}`);
      for (const line of readFileSync(file, "latin1").split(/\r?\n/)) {
        const w = line.trim().toLowerCase();
        if (w.length === len && /^[a-z]+$/.test(w) && valid.has(w)) familiar.add(w);
      }
    }
  }
  return { valid: [...valid].sort(), familiar: [...familiar].sort() };
}

/**
 * Enumerate rings for a board: choose a letter for every corner, which fixes
 * each word's first and last letter, then take the words that fit.
 *
 * Walking the corner space rather than the word space is what makes this
 * tractable — a pentagon is 26^5 corner assignments, against 1365^5 quintuples
 * of words.
 */
function enumerateRings(board, pool, perAssignment) {
  const byEnds = new Map();
  for (const w of pool) {
    const key = w[0] + w[w.length - 1];
    if (!byEnds.has(key)) byEnds.set(key, []);
    byEnds.get(key).push(w);
  }
  // For each side, which corner join supplies its first letter and which its
  // last. Both always exist: every word runs corner to corner.
  const ends = board.sides.map((side, si) => {
    const last = side.slots.length - 1;
    let head = -1;
    let tail = -1;
    board.joins.forEach((join, ji) => {
      join.forEach((e) => {
        if (e.side !== si) return;
        if (e.pos === 0) head = ji;
        if (e.pos === last) tail = ji;
      });
    });
    return { head, tail };
  });

  // Which sides become fully determined once join `ji` is assigned — both of
  // their corner letters known. Checking those immediately prunes most of the
  // corner space instead of walking it to the leaves.
  const settledAt = board.joins.map((_, ji) =>
    board.sides
      .map((_, si) => si)
      .filter((si) => Math.max(ends[si].head, ends[si].tail) === ji));

  const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");
  const corner = new Array(board.n);
  const out = [];
  const seen = new Set();
  let taken = 0;

  const chooseWords = (si, chosen) => {
    if (taken >= perAssignment) return;
    if (si === board.n) {
      if (new Set(chosen).size < board.n) return; // no repeated words
      const cells = cellsFromWords(board, chosen);
      // Every letter distinct: a repeat makes two different arrangements look
      // identical on the board, which reads as a bug rather than a puzzle.
      if (new Set(cells).size !== board.cellCount) return;
      const vowels = cells.filter((c) => VOWELS.has(c)).length;
      if (vowels < Math.floor(board.cellCount / 4)) return;
      if (vowels > Math.ceil(board.cellCount / 2.4)) return;
      // Two rings of the same words are the same puzzle rotated.
      const key = [...chosen].sort().join(" ");
      if (seen.has(key)) return;
      seen.add(key);
      out.push([...chosen]);
      taken++;
      return;
    }
    const { head, tail } = ends[si];
    const fits = byEnds.get(corner[head] + corner[tail]);
    if (!fits) return;
    for (const w of fits) {
      chosen.push(w);
      chooseWords(si + 1, chosen);
      chosen.pop();
      if (taken >= perAssignment) return;
    }
  };

  const chooseCorners = (ji) => {
    if (ji === board.n) {
      // A bounded haul per corner assignment, so no single region of the
      // alphabet can crowd out the rest. Sweeping the WHOLE corner space and
      // taking a little from each is what keeps the pool diverse; capping the
      // total instead truncates an alphabetical walk, which is how an earlier
      // build ended up with 125 of 365 Medium puzzles starting with "b".
      taken = 0;
      chooseWords(0, []);
      return;
    }
    for (const c of LETTERS) {
      corner[ji] = c;
      // Prune: any side whose corners are both now known must have a word
      // that fits, or nothing below this branch can succeed.
      const dead = settledAt[ji].some(
        (si) => !byEnds.has(corner[ends[si].head] + corner[ends[si].tail]),
      );
      if (!dead) chooseCorners(ji + 1);
    }
  };

  chooseCorners(0);
  return out;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const emitted = {};
const lengths = new Set();

for (const mode of MODES) {
  const board = boardFor(mode);
  const { valid, familiar } = wordsOfLength(mode.sideLen);
  lengths.add(mode.sideLen);

  console.log(`\n── ${mode.label}: ${board.label.toLowerCase()}, ${mode.sideLen}-letter words`);
  console.log(`   familiar words: ${familiar.length}   valid: ${valid.length}`);

  // Enumerate generously, then spread the selection across the result rather
  // than taking a prefix — the walk is alphabetical by corner, so the first N
  // rings would all start with 'a'.
  const rings = enumerateRings(board, familiar, 2);
  console.log(`   distinct rings found: ${rings.length.toLocaleString()}`);

  const byEnds = indexWords(familiar);
  const stride = Math.max(1, Math.floor(rings.length / COUNT));
  const chosen = [];
  for (let i = 0; i < rings.length && chosen.length < COUNT; i += stride) {
    const words = rings[i];
    // The given side is fixed here so its ring count can be too.
    const given = Math.floor(mulberry32(chosen.length * 104729 + 17)() * board.n);
    const cells = cellsFromWords(board, words);
    const count = countRings(board, cells, given, new Set(familiar), byEnds);
    chosen.push([words.join(" "), given, count]);
  }

  const counts = chosen.map((c) => c[2]).sort((a, b) => a - b);
  console.log(`   selected ${chosen.length}`);
  console.log(
    `   valid rings per puzzle — min ${counts[0]}, median ${counts[counts.length >> 1]}, max ${counts.at(-1)}`,
  );
  console.log(`   unique-solution puzzles: ${counts.filter((c) => c === 1).length}`);
  if (counts[0] < 1) console.warn("   ! a puzzle reports no solution — that is a bug");

  emitted[mode.id] = chosen;
}

// The win check needs a word list at runtime, because a player who lands a
// DIFFERENT valid ring has genuinely won.
//
// It ships the FAMILIAR pool, not the full dictionary. Measured on the square,
// two thirds of the sides that lit up under the full ENABLE list held a word
// nobody knows — KEPS, DAWS, SABE — because ENABLE is 76% unfamiliar at four
// letters and 84% at five. A board that lights up for a word the player cannot
// recognise is not being generous, it is being noisy: it offers a lock they
// have no way to evaluate, and hands out wins that feel like accidents.
//
// The cost is real and worth stating: a player who forms a genuinely valid but
// obscure word is told nothing. That is the trade — every light means
// something, at the price of a few unrewarded discoveries.
const wordLists = {};
for (const len of [...lengths].sort()) {
  wordLists[len] = wordsOfLength(len).familiar.join("");
}

const fmt = (rows) =>
  `[\n${rows.map((r) => `  ${JSON.stringify(r)},`).join("\n")}\n]`;

const out = `// GENERATED FILE — do not edit by hand.
// Regenerate with: npm run wordiamond
//
// One pool per difficulty. Each entry is:
//
//   words  the ring, in side order, sharing corner letters (see shapes.js)
//   given  index of the side handed to the player already solved
//   rings  how many complete valid rings exist at all, precomputed here so the
//          post-game tally costs the browser nothing
//
// Do not reorder or rewrite an existing entry: puzzles are selected by index
// off the daily seed, so shuffling an array silently rewrites which puzzle a
// past date served.

export const POOLS = {
${MODES.map((m) => `  ${m.id}: ${fmt(emitted[m.id])},`).join("\n")}
};

/**
 * Every word the win check accepts, by length, concatenated. Split to rebuild.
 * This is the FAMILIAR pool, not the full dictionary — see build-wordiamond.mjs
 * for why a board that lights up for KEPS is worse than one that does not.
 */
export const WORDS = {
${[...lengths].sort().map((len) => `  ${len}: ${JSON.stringify(wordLists[len])},`).join("\n")}
};
`;

const dest = path.join(root, "src/data/wordiamondPuzzles.js");
writeFileSync(dest, out);
console.log(`\nwrote ${path.relative(root, dest)} (${(out.length / 1024).toFixed(1)} KB)`);
