// Shared Storey pool + bookend logic for the builder and the verifier.
//
// Kept in one place so the day builder and the verifier answer "what is par for
// this hand?" from byte-identical data — the same reason lib-vanityplate exists.
//
// The FAMILIAR pool (rootword 3–7 ∪ SCOWL tier-10) capped at PAR_CAP letters is
// what par is measured over: par should be reachable with words a player can
// actually summon. Longer or rarer words (up to the full ENABLE list the client
// already loads) are the birdie ceiling — they let a strong vocabulary climb
// ABOVE par, they never define it.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { WORDS as ROOT } from "../src/data/rootwordPool.js";
import { WORDS_BY_TIER } from "../src/data/commonWords.js";
import { PAR_CAP, VOWELS, pillarsOf, bestTower } from "../src/games/storey/engine.js";

const dir = path.dirname(fileURLToPath(import.meta.url));

/** The full ENABLE validity list — same file the client fetches at runtime. */
export function loadEnable() {
  const text = readFileSync(path.join(dir, "..", "public/data/dictionary.txt"), "utf8");
  return new Set(text.split("\n").map((w) => w.trim()).filter(Boolean));
}

/**
 * The familiar pool as `{ word, left, right, width, cons }`, one entry per
 * consonant-bookended word ≤ PAR_CAP letters, with `cons` its set of consonant
 * letters. Since a floor must be built ONLY from a hand's letters, par depends
 * on the hand — so we can't bake a single table; instead we filter this list
 * per hand (see tableForHand). Sorted so table-building is deterministic:
 * shortest-then-alphabetical last means the WIDEST, and on a tie the
 * lexicographically smaller word, wins each (left,right) cell.
 */
export function loadFamiliarWords() {
  const familiar = [...new Set([...ROOT, ...WORDS_BY_TIER["10"]].map((w) => w.toLowerCase()))];
  const out = [];
  for (const w of familiar) {
    if (w.length > PAR_CAP) continue;
    const p = pillarsOf(w);
    if (!p) continue;
    const cons = new Set([...w].filter((c) => !VOWELS.has(c)));
    out.push({ word: w, left: p.left, right: p.right, width: w.length, cons });
  }
  out.sort((a, b) => a.width - b.width || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0));
  return out;
}

/**
 * The bookend table for one hand: table[left][right] = the widest familiar word
 * whose consonants are ALL among `handSet`. Because the list is width-ascending,
 * a later (wider) word overwrites, so the final cell holds the widest.
 */
export function tableForHand(handSet, famWords) {
  const table = Object.create(null);
  for (const e of famWords) {
    let ok = true;
    for (const c of e.cons) if (!handSet.has(c)) { ok = false; break; }
    if (!ok) continue;
    (table[e.left] ??= Object.create(null));
    table[e.left][e.right] = { width: e.width, word: e.word };
  }
  return table;
}

/**
 * Distinct-pair fairness floor per tier: how many different letter pairs must be
 * able to bear a floor, so a hand offers more than one way to build. Shared by
 * the builder (as a gate) and the verifier (as a check).
 */
export const MIN_PAIRS = { easy: 12, medium: 20, hard: 28 };

/** A `pairWord(a,b)` closure over a bookend table, for engine.bestTower. */
export function pairWordFrom(table) {
  return (a, b) => (table[a] && table[a][b]) || null;
}

/** Par + optimal tower for a hand, building its own filtered table first. */
export function parFor(hand, gravity, famWords) {
  const table = tableForHand(new Set(hand), famWords);
  return bestTower(hand, gravity, pairWordFrom(table));
}

/**
 * How many DISTINCT letter pairs in this hand can bear a floor at all. A hand
 * where only a few pairings work is a forced solution, not a puzzle; the
 * builder's fairness gate rejects those.
 */
export function playablePairs(hand, famWords) {
  const table = tableForHand(new Set(hand), famWords);
  const pw = pairWordFrom(table);
  const seen = new Set();
  for (let i = 0; i < hand.length; i++)
    for (let j = i + 1; j < hand.length; j++) {
      if (pw(hand[i], hand[j]) || pw(hand[j], hand[i])) {
        seen.add([hand[i], hand[j]].sort().join(""));
      }
    }
  return seen.size;
}
