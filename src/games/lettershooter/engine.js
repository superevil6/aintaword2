// Letter Shooter — pure rules. DOM-free and dictionary-data-free, so the game
// screen, the day builder, and the verifier all share this ONE source of truth.
//
// THE GAME. Walls of letters scroll past a firing column, one row at a time.
// You start each round holding a single "ammo" letter and build a word by
// grabbing one letter from each row as it passes — grab a letter that keeps a
// real word alive and it's added; grab one that dead-ends your word and you
// bust, forfeiting it. Cash any real word (≥3) before a row kills it. Five
// rounds a run.
//
// DETERMINISM. Everything a player sees is regenerated from the day's seed, so
// the whole world plays the identical board. Each row is seeded INDEPENDENTLY
// (`${seed}:r{round}:n{index}`) so any row can be reproduced in isolation — the
// builder and verifier reconstruct exact rows without replaying a stream, and
// two players' boards can never drift. Rows do NOT depend on the word you've
// built, which is what makes the look-ahead honest: the rows above the active
// one are exactly what you'll get.
//
// The generator guarantees ≥2 vowels per row (measured: 2 is the sweet spot; a
// third adds nothing) and WIDENS rows with depth, which keeps long words
// reachable exactly where availability would otherwise sag.

import { Rng } from "../../core/rng.js";

export const ROUNDS = 5;
export const MIN_WORD = 3; // shortest cashable word
export const MAX_CELL_WIDTH = 9; // a row never shows more than this many letters

export const VOWELS = ["a", "e", "i", "o", "u"];
const VOWEL_W = { a: 43, e: 56, i: 39, o: 37, u: 19 };
const CONSONANTS = [..."bcdfghjklmnpqrstvwxyz"];
// Weighted toward the consonants that actually continue words — the same shape
// the standalone prototype used, which the availability measurement was run on.
const CONS_W = {
  r: 39, t: 35, n: 34, s: 29, l: 28, c: 23, d: 17, p: 17, m: 17, h: 15,
  g: 14, b: 11, y: 10, f: 8, v: 6, k: 6, w: 5, z: 3, x: 2, q: 2, j: 1,
};
// Ammo letters weighted by how often a word actually STARTS with them.
const START = [..."abcdefghijklmnopqrstuvwxyz"];
const START_W = {
  s: 87, c: 70, p: 62, b: 47, d: 44, r: 43, m: 43, t: 43, a: 40, f: 36,
  g: 32, h: 32, l: 31, w: 29, e: 28, i: 27, n: 24, o: 21, v: 18, u: 16,
  k: 11, j: 5, q: 5, y: 5, z: 3, x: 1,
};

/** Score for a cashed word of length `len` — superlinear so length is worth chasing. */
export function scoreWord(len) {
  return len * len;
}

// ── seeded letter picking ────────────────────────────────────────────────────

function weightedIndex(rng, weights) {
  let sum = 0;
  for (const w of weights) sum += w;
  let r = rng.float() * sum;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

/** k DISTINCT weighted picks from `items` (no ugly repeats in a row). */
function weightedDistinct(rng, items, wmap, k) {
  const pool = items.slice();
  const out = [];
  for (let n = 0; n < k && pool.length; n++) {
    const idx = weightedIndex(rng, pool.map((c) => wmap[c] || 1));
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

// ── the board, regenerated from the seed ─────────────────────────────────────

/** The letter you start a round holding. Same for everyone on the day. */
export function ammoAt(seed, round) {
  const rng = new Rng(`${seed}:r${round}:ammo`);
  return weightedDistinct(rng, START, START_W, 1)[0];
}

/** How wide row `n` is — grows with depth ("the next row has more letters"). */
export function rowWidth(profile, n) {
  return Math.min(MAX_CELL_WIDTH, profile.baseN + Math.floor(n / 2));
}

/**
 * Row `n` of a round: its letters (≥2 vowels), scroll direction, base speed and
 * starting phase — all seeded so it's identical for every player and reproducible
 * in isolation. The order of rng draws here is FIXED; the builder, verifier and
 * client all reproduce it exactly.
 * @returns {{letters:string[], dir:1|-1, speed:number, phase:number, width:number}}
 */
export function rowAt(seed, round, n, profile) {
  const rng = new Rng(`${seed}:r${round}:n${n}`);
  const width = rowWidth(profile, n);
  const vc = Math.min(rng.int(2, 3), width - 2); // 2 or 3 vowels
  const vs = weightedDistinct(rng, VOWELS, VOWEL_W, vc);
  const cs = weightedDistinct(rng, CONSONANTS, CONS_W, width - vs.length);
  const letters = rng.shuffle([...vs, ...cs]);

  // Speed: base ± spread, then the fastest rows knocked down 20% (so quick
  // reflexes aren't required) while the mid-range urgency stays intact.
  const s = profile.spread / 100;
  const j = (rng.float() * 2 - 1) * s;
  const fast = s > 0 && j > 0 ? j / s : 0;
  const speed = Math.max(30, profile.baseSpeed * (1 + j) * (1 - 0.2 * fast));
  const dir = rng.float() < 0.5 ? 1 : -1;
  const phase = rng.float();
  return { letters, dir, speed, phase, width };
}

// ── dictionary prefix membership (shared by client + node) ───────────────────

/**
 * Does any word in the SORTED lowercase list start with `s`? A binary search for
 * the first word ≥ s; if that word begins with s, s is a live prefix (this is
 * also true when s is itself a word, so it answers "is this word still alive?").
 */
export function prefixExists(sortedWords, s) {
  let lo = 0, hi = sortedWords.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedWords[mid] < s) lo = mid + 1;
    else hi = mid;
  }
  return lo < sortedWords.length && sortedWords[lo].startsWith(s);
}

// ── "perfect-timing par": the best word the board allows ─────────────────────

/**
 * The best word reachable in one round if your timing were perfect — you can
 * always hit the letter you want, so the only limit is which letters the seeded
 * rows offer and whether they keep a word alive. This is the ceiling the daily's
 * par is measured against; real play pays the timing tax.
 *
 * A breadth-first sweep over live prefixes: start holding the ammo letter, and
 * at each row extend every live prefix by any letter the row contains that keeps
 * it alive (`lex.isPrefix`). PAR counts only FAMILIAR words (the `familiar` set),
 * so it's a target everyday vocabulary can reach — obscure long words the search
 * would otherwise find are the above-par birdie, not the bar. With no familiar
 * set, any real word counts (`lex.isWord`), i.e. the absolute ceiling.
 *
 * @returns {{word:string, score:number}}
 */
export function bestWordForRound(seed, round, profile, lex, familiar = null, maxRows = profile.maxRows) {
  const ammo = ammoAt(seed, round);
  const counts = familiar ? (w) => familiar.has(w) : (w) => lex.isWord(w);
  let frontier = new Set([ammo]);
  let best = { word: "", score: 0 };

  for (let n = 0; n < maxRows && frontier.size; n++) {
    const letters = new Set(rowAt(seed, round, n, profile).letters);
    const next = new Set();
    for (const prefix of frontier) {
      for (const c of letters) {
        const cand = prefix + c;
        if (!lex.isPrefix(cand)) continue; // dead end — the player would bust here
        next.add(cand);
        if (cand.length >= MIN_WORD && counts(cand)) {
          const sc = scoreWord(cand.length);
          // Deterministic tie-break so the builder and verifier agree exactly.
          if (sc > best.score || (sc === best.score && cand < best.word)) {
            best = { word: cand, score: sc };
          }
        }
      }
    }
    frontier = next;
  }
  return best;
}

/**
 * A whole day's build for one tier: the five ammo letters, the par (sum of each
 * round's perfect-timing best FAMILIAR word), and those words for the reveal.
 * Recomputed verbatim by the verifier from the same seed + familiar pool.
 */
export function buildDailySet(seed, profile, lex, familiar = null) {
  const ammo = [];
  const best = [];
  let par = 0;
  for (let r = 0; r < profile.rounds; r++) {
    ammo.push(ammoAt(seed, r).toUpperCase());
    const b = bestWordForRound(seed, r, profile, lex, familiar);
    best.push({ word: b.word.toUpperCase(), score: b.score });
    par += b.score;
  }
  return { ammo, par, best };
}
