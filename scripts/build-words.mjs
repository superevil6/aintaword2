// Generates src/data/commonWords.js — the pool of real words players see.
//
//   node scripts/build-words.mjs
//
// Source: SCOWL (scripts/data/scowl/), whose "size" tiers act as a commonness
// ranking. Level 10 is the most common English vocabulary; higher tiers get
// progressively more obscure. SCOWL's license explicitly permits commercial
// use and sale of derived output provided the copyright notice travels along —
// see scripts/data/scowl/COPYRIGHT and THIRD-PARTY-NOTICES.md.
//
// The pipeline is deliberately conservative: this game asks players to judge a
// word as real or fake in about a second, so an unfamiliar-but-real word is
// just as bad as a bad fake. Quality beats quantity.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { fakeCandidates } from "../src/games/aintaword/wordSmith.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");

// SCOWL size tiers, emitted separately so difficulty can use FAMILIARITY as an
// axis, not just word length. Tier 10 is the most common English vocabulary;
// 20 is common-but-less-so; 35 starts admitting words like "abacus" and
// "abdicate". The tiers are disjoint — each word appears in exactly one.
const TIERS = ["10", "20", "35"];
const VARIANTS = ["english", "american"]; // American spellings only — mixing in
// British forms (e.g. "colour") would look fake to a US player.

const MIN_LEN = 5;
// Up to 15 so the Hard band (10+) has real material. The UI auto-fits the
// font to the word length, so long words still fit two-across on a phone.
const MAX_LEN = 15;

// Function words. Grammatically common but poor game material: over-familiar,
// mostly short, and they read as grammar rather than vocabulary.
const STOPWORDS = new Set(
  `about above after again against also although always among another any anyone
   anything are aren because been before being below beneath beside besides
   between both cannot could couldn does doesn doing done down during each
   either else enough even ever every everyone everything except few from
   further had hadn has hasn have haven having hence her hers herself him
   himself his how however into itself just least less like many might mine
   more most much must mustn myself neither never nevertheless next nobody none
   nor not nothing now once only onto other others ought our ours ourselves out
   over own perhaps rather same shall shan she should shouldn since some
   somebody someone something sometimes somewhat still such than that the their
   theirs them themselves then thence there therefore these they this those
   though through thus together too toward towards under unless until unto upon
   very was wasn were weren what whatever when whenever where whereas wherever
   whether which whichever while whither who whoever whom whose why will with
   within without would wouldn yet you your yours yourself yourselves`
    .split(/\s+/)
    .filter(Boolean),
);

// Words that would land badly in a casual, ad-supported game. Not about
// censorship — just tone. A player shouldn't hit "suicide" between "banana"
// and "window".
const BLOCKED = new Set(
  `abuse abused abuses addict addicted addiction adultery alcohol alcoholic
   assault bomb bombed bombing bullet cadaver cancer casket coffin corpse
   corpses cocaine coffins convict corpse dead deadly death deaths deceased
   die died dies dying drug drugged drugs drunk execute executed execution
   funeral gun guns hanged heroin hostage kill killed killer killers killing
   kills lethal molest morgue mortal murder murdered murderer murders naked
   narcotic nude nudity opiate overdose pistol poison poisoned porn rape raped
   rapist rifle sex sexual sexually sexy shooting shot slain slave slavery
   slaves smoking stab stabbed strangle suicide terror terrorism terrorist
   tobacco tomb tortured torture toxic trauma tumor tumors victim victims
   violence violent war warfare weapon weapons whiskey wounded wounds`
    .split(/\s+/)
    .filter(Boolean),
);

// --- load sources ---------------------------------------------------------

function readWords(file) {
  // SCOWL files are ISO-8859-1 and may carry CR line endings.
  return readFileSync(file, "latin1").split(/\r?\n/);
}

// word -> tier (tiers are disjoint, so first writer wins and there are no
// collisions in practice; the guard keeps that assumption honest).
const raw = new Map();
for (const tier of TIERS) {
  for (const variant of VARIANTS) {
    const file = path.join(dir, "data", "scowl", `${variant}-words.${tier}`);
    for (const line of readWords(file)) {
      const w = line.trim();
      if (w && !raw.has(w)) raw.set(w, tier);
    }
  }
}

const validity = new Set(
  readFileSync(path.join(root, "public/data/dictionary.txt"), "utf8")
    .split("\n")
    .map((w) => w.trim())
    .filter(Boolean),
);

// --- filter ---------------------------------------------------------------

const stats = {
  raw: raw.size,
  shape: 0,
  notInDictionary: 0,
  stopword: 0,
  blocked: 0,
  noViableFake: 0,
};

const dictShim = { isWord: (w) => validity.has(w.toLowerCase()) };

const byTier = Object.fromEntries(TIERS.map((t) => [t, []]));
for (const [word, tier] of raw) {
  if (!/^[a-z]+$/.test(word) || word.length < MIN_LEN || word.length > MAX_LEN) {
    stats.shape++;
    continue;
  }
  if (!validity.has(word)) {
    // Keeps the source pool and the validity dictionary consistent.
    stats.notInDictionary++;
    continue;
  }
  if (STOPWORDS.has(word)) {
    stats.stopword++;
    continue;
  }
  if (BLOCKED.has(word)) {
    stats.blocked++;
    continue;
  }
  // A word is only useful if the generator can actually forge a fake from it.
  if (fakeCandidates(word, dictShim).length === 0) {
    stats.noViableFake++;
    continue;
  }
  byTier[tier].push(word);
}
for (const t of TIERS) byTier[t].sort();
const total = TIERS.reduce((n, t) => n + byTier[t].length, 0);

// --- emit -----------------------------------------------------------------

// Stored as one space-separated string rather than a quoted array: same data,
// a fraction of the bytes, and a far smaller diff when regenerated.
const tierBlocks = TIERS.map(
  (t) => `  // tier ${t} — ${byTier[t].length} words\n  "${t}": "${byTier[t].join(" ")}".split(" "),`,
).join("\n");

const out = `// GENERATED FILE — do not edit by hand.
// Regenerate with: npm run words
//
// The pool of real words the game shows, grouped by SCOWL size tier. Lower
// tier = more familiar; difficulty profiles combine tier with word length.
// Derived from SCOWL levels ${TIERS.join(", ")} (${VARIANTS.join(" + ")} spellings),
// intersected with the ENABLE validity dictionary, then filtered to
// ${MIN_LEN}-${MAX_LEN} letters with function words, tonally-inappropriate words,
// and words that cannot yield a fake removed.
//
// SCOWL is Copyright 2000-2018 Kevin Atkinson — see THIRD-PARTY-NOTICES.md.
// ${total} words total.

export const WORDS_BY_TIER = {
${tierBlocks}
};

/** Flattened pool across the given tiers (defaults to all). */
export function wordsForTiers(tiers = Object.keys(WORDS_BY_TIER)) {
  return tiers.flatMap((t) => WORDS_BY_TIER[String(t)] || []);
}
`;

writeFileSync(path.join(root, "src/data/commonWords.js"), out);

console.log("SCOWL tiers:", TIERS.join(", "), "| variants:", VARIANTS.join(", "));
console.log("removed:");
console.log(`  wrong shape/length : ${stats.shape}`);
console.log(`  not in dictionary  : ${stats.notInDictionary}`);
console.log(`  function words     : ${stats.stopword}`);
console.log(`  tone-blocked       : ${stats.blocked}`);
console.log(`  no viable fake     : ${stats.noViableFake}`);
console.log("\nkept per tier:");
for (const t of TIERS) {
  const lens = byTier[t].reduce((a, w) => {
    const k = w.length <= 6 ? "5-6" : w.length <= 9 ? "7-9" : "10+";
    a[k] = (a[k] || 0) + 1;
    return a;
  }, {});
  console.log(
    `  tier ${t}: ${String(byTier[t].length).padStart(5)}  ` +
      `(5-6: ${lens["5-6"] || 0}, 7-9: ${lens["7-9"] || 0}, 10+: ${lens["10+"] || 0})`,
  );
}
console.log(`\n✅ wrote ${total} words to src/data/commonWords.js`);
