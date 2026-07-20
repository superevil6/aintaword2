// Headless verification of the game's core logic — no browser needed.
//
//   node scripts/verify.mjs
//
// Loads the real dictionary from disk (instead of fetch), then hammers the
// fake-word generator and asserts the invariants the game depends on:
//   - the "real" word is genuinely in the dictionary
//   - the "fake" word is NOT in the dictionary
//   - fake !== real
//   - first and last letters are preserved
// Also reports transformation-type coverage and any source words that can't
// produce a fake.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { wordsForTiers, WORDS_BY_TIER } from "../src/data/commonWords.js";
import { Rng } from "../src/core/rng.js";
import { makePair, fakeCandidates } from "../src/games/aintaword/wordSmith.js";
import { DIFFICULTIES, DIFFICULTY_ORDER } from "../src/games/aintaword/difficulty.js";

const COMMON_WORDS = wordsForTiers();

const dir = path.dirname(fileURLToPath(import.meta.url));
const text = readFileSync(path.join(dir, "../public/data/dictionary.txt"), "utf8");

const valid = new Set(text.split("\n").map((w) => w.trim()).filter(Boolean));
const sources = [...new Set(COMMON_WORDS.map((w) => w.toLowerCase()))];
for (const w of sources) valid.add(w);

const dict = {
  isWord: (w) => valid.has(w.toLowerCase()),
  sourcePool: ({ minLen = 0, maxLen = Infinity, tiers = null } = {}) =>
    (tiers ? wordsForTiers(tiers) : sources).filter(
      (w) => w.length >= minLen && w.length <= maxLen,
    ),
};

console.log(`dictionary: ${valid.size} valid words | curated sources: ${sources.length}`);

// Independent edit-distance implementation — deliberately NOT imported from
// wordSmith.js, so the test doesn't validate the code against itself.
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return d[a.length][b.length];
}

// --- invariant sweep, mimicking the real difficulty ramp ------------------
let checked = 0;
let fails = 0;
const typeCounts = {};
const distances = [];
const rng = new Rng("verify-seed");

const perDifficulty = {};
for (let i = 0; i < 10000; i++) {
  // Cycle the three fixed profiles instead of the old score-based ramp.
  const prof = DIFFICULTIES[DIFFICULTY_ORDER[i % 3]];
  const p = makePair(dict, rng, {
    minLen: prof.minLen,
    maxLen: prof.maxLen,
    tiers: prof.tiers,
    difficulty: prof.subtlety,
  });
  if (!p) {
    fails++;
    if (fails <= 20) console.log(`  ✗ null pair at i=${i} (${prof.id})`);
    continue;
  }
  const d = (perDifficulty[prof.id] ||= { n: 0, lens: [] });
  d.n++;
  d.lens.push(p.real.length);
  // The band is a hard contract: a Hard round must never serve a 6-letter word.
  if (p.real.length < prof.minLen || p.real.length > prof.maxLen) {
    fails++;
    if (fails <= 20)
      console.log(`  ✗ ${prof.id}: "${p.real}" (${p.real.length}) outside ${prof.minLen}-${prof.maxLen}`);
  }
  checked++;
  typeCounts[p.type] = (typeCounts[p.type] || 0) + 1;

  const { real, fake, fakeSource } = p;
  const errs = [];
  if (!dict.isWord(real)) errs.push("real not a word");
  if (dict.isWord(fake)) errs.push("fake IS a real word");
  if (real === fake) errs.push("fake === real");

  // The transformation preserves first/last letter of the fake's OWN source
  // word — not of the unrelated real word shown beside it.
  if (!dict.isWord(fakeSource)) errs.push("fake source not a word");
  if (fakeSource === real) errs.push("fake was forged from the displayed real word");
  if (fakeSource[0] !== fake[0]) errs.push("first letter changed vs source");
  if (fakeSource.at(-1) !== fake.at(-1)) errs.push("last letter changed vs source");

  // The two words on screen must read as genuinely different words.
  const dist = editDistance(real, fake);
  if (dist < 3) errs.push(`shown words too similar (edit distance ${dist})`);
  distances.push(dist);

  if (errs.length) {
    fails++;
    if (fails <= 20)
      console.log(`  ✗ real=${real} fake=${fake} (from ${fakeSource}) [${p.type}]: ${errs.join("; ")}`);
  }
}

console.log(`\nchecked ${checked} pairs | ${fails} failures`);
console.log("transformation coverage:", typeCounts);
const minDist = Math.min(...distances);
const avgDist = (distances.reduce((a, b) => a + b, 0) / distances.length).toFixed(2);
console.log(`edit distance between shown words: min ${minDist}, avg ${avgDist}`);

console.log("\nper difficulty:");
for (const id of DIFFICULTY_ORDER) {
  const d = perDifficulty[id];
  const avg = (d.lens.reduce((a, b) => a + b, 0) / d.lens.length).toFixed(1);
  const prof = DIFFICULTIES[id];
  console.log(
    `  ${id.padEnd(7)} ${String(d.n).padStart(4)} rounds | ` +
      `len ${prof.minLen}-${prof.maxLen} (avg ${avg}) | tiers ${prof.tiers.join("+")} | ` +
      `pool ${dict.sourcePool({ minLen: prof.minLen, maxLen: prof.maxLen, tiers: prof.tiers }).length}`,
  );
}

// --- readable samples -----------------------------------------------------
const rs = new Rng("samples");
for (const id of DIFFICULTY_ORDER) {
  const prof = DIFFICULTIES[id];
  console.log(`\nsample ${id.toUpperCase()} rounds — which word is real?`);
  for (let i = 0; i < 6; i++) {
    const p = makePair(dict, rs, {
      minLen: prof.minLen,
      maxLen: prof.maxLen,
      tiers: prof.tiers,
      difficulty: prof.subtlety,
    });
    console.log(
      `  ${p.real.padEnd(16)} vs ${p.fake.padEnd(16)}` +
        `  (from "${p.fakeSource}" via ${p.type})`,
    );
  }
}

// --- coverage: source words that can never make a fake --------------------
const zero = sources.filter((w) => fakeCandidates(w, dict).length === 0);
console.log(`\nsource words with 0 possible fakes: ${zero.length}/${sources.length}`);
if (zero.length) console.log("  e.g.", zero.slice(0, 20).join(", "));

console.log(fails === 0 ? "\n✅ ALL INVARIANTS HELD" : `\n❌ ${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
