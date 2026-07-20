// wordSmith — turns a real word into a convincing fake.
//
// The design brief: take a real word and deterministically change a hard-to-
// notice aspect while ALWAYS keeping the first and last letter the same, and
// never accidentally producing another real word. We implement four subtle
// transformations, all confined to interior letters:
//
//   vowel-swap   palace -> pelace     (swap one interior vowel for another)
//   degeminate   balloon -> baloon    (drop one half of a double letter)
//   geminate     planet  -> plannet   (double an interior single consonant)
//   transpose    friend  -> freind    (swap two adjacent interior letters)
//
// A candidate only counts as a fake if it differs from the original AND is not
// in the validity dictionary — that second check is why the ~48k-word list
// matters: it stops "bat -> bet" or "from -> form" style collisions where the
// tweak lands on a genuine word.
//
// IMPORTANT: the two words shown in a round are DISTINCT words. The fake is
// forged from its own source word, never from the real word displayed next to
// it — otherwise the round degenerates into spot-the-difference between two
// spellings of one word. See makePair() for the pairing rules.

const VOWELS = "aeiou";
const isVowel = (c) => VOWELS.includes(c);

// --- plausibility ---------------------------------------------------------
// Now that the two words on screen are unrelated, each is judged on its own
// merits — so a fake has to look like it could be English. Candidates that
// break English spelling patterns (stt-, sll-, -oou-) are free points for the
// player and get filtered out here.

// Letters English essentially never doubles. Vowels a/i/u are included: "ee"
// and "oo" are common, "aa"/"ii"/"uu" are not.
const NEVER_DOUBLE = new Set(["h", "j", "q", "v", "w", "x", "y", "a", "i", "u"]);

// Consonants that plausibly double between vowels (planet -> plannet).
const DOUBLABLE = new Set("bcdfgklmnprstz".split(""));

function maxConsonantRun(word) {
  let max = 0;
  let run = 0;
  for (const c of word) {
    if (isVowel(c)) run = 0;
    else if (++run > max) max = run;
  }
  return max;
}

// Consonant clusters English permits at the START of a word. A transposition
// can shove a consonant into position 1 and invent an onset that no English
// word has (candy -> cnady), which reads as instantly fake.
const ONSETS2 = new Set(
  ("bl br ch cl cr dr dw fl fr gh gl gn gr kn ph pl pn pr ps qu rh sc sh sk sl " +
    "sm sn sp sq st sw th tr tw wh wr")
    .split(" "),
);
const ONSETS3 = new Set("chr phl phr sch scl scr shr spl spr squ str thr".split(" "));

// 'y' behaves as a vowel anywhere but the first letter (candy, rhythm).
const isVowelish = (c, i) => isVowel(c) || (c === "y" && i > 0);

function initialClusterLength(word) {
  let n = 0;
  while (n < word.length && !isVowelish(word[n], n)) n++;
  return n;
}

function hasLegalOnset(word) {
  const n = initialClusterLength(word);
  if (n <= 1) return true;
  if (n === 2) return ONSETS2.has(word.slice(0, 2));
  if (n === 3) return ONSETS3.has(word.slice(0, 3));
  return false;
}

function isPlausible(word) {
  if (!/[aeiou]/.test(word)) return false; // must have a vowel
  if (/(.)\1\1/.test(word)) return false; // no triple letters
  if (/[aeiou]{3,}/.test(word)) return false; // no 3-vowel runs (curoous)
  if (!hasLegalOnset(word)) return false; // no cnady / ptelt
  for (let i = 1; i < word.length; i++) {
    if (word[i] === word[i - 1] && NEVER_DOUBLE.has(word[i])) return false;
  }
  return true;
}

// --- candidate generators -------------------------------------------------
// Each returns an array of { word, type } candidates. All operate strictly on
// interior positions so word[0] and word[last] are preserved by construction.

function vowelSwaps(word) {
  const out = [];
  const lim = mutableLimit(word);
  for (let i = 1; i < lim; i++) {
    if (!isVowel(word[i])) continue;
    for (const v of VOWELS) {
      if (v === word[i]) continue;
      out.push({ word: word.slice(0, i) + v + word.slice(i + 1), type: "vowel-swap" });
    }
  }
  return out;
}

function degeminations(word) {
  const out = [];
  // Remove index i when it duplicates its left neighbour. i ranges over
  // interior-or-later positions but never the last, so the tail letter stays.
  const lim = mutableLimit(word);
  for (let i = 1; i < lim; i++) {
    if (word[i] === word[i - 1]) {
      out.push({ word: word.slice(0, i) + word.slice(i + 1), type: "degeminate" });
    }
  }
  return out;
}

function geminations(word) {
  const out = [];
  // Double an interior single consonant, but only where English actually
  // doubles: a doublable consonant sitting BETWEEN two vowels.
  //   planet -> plannet ✓   (n between a and e)
  //   sleep  -> slleep  ✗   (l follows the consonant s — not English)
  //   stomach-> sttomach ✗  (t follows s)
  // Short words make doubling too conspicuous (data -> datta).
  if (word.length < 6) return out;
  const lim = mutableLimit(word);
  for (let i = 1; i < lim; i++) {
    const c = word[i];
    if (isVowel(c) || !DOUBLABLE.has(c)) continue;
    if (c === word[i - 1] || c === word[i + 1]) continue;
    if (!isVowel(word[i - 1]) || !isVowel(word[i + 1])) continue;
    // English doubles only after a SINGLE short vowel. After a vowel digraph
    // it never does, so "pieces" -> "piecces" reads as instantly wrong.
    if (i - 2 >= 0 && isVowel(word[i - 2])) continue;
    // Never double before a final silent 'e' (made -> madde, write -> writte).
    if (i + 1 === word.length - 1 && word[i + 1] === "e") continue;
    out.push({ word: word.slice(0, i + 1) + c + word.slice(i + 1), type: "geminate" });
  }
  return out;
}

function transpositions(word) {
  const out = [];
  const baseRun = maxConsonantRun(word);
  // Swap adjacent interior letters (both indices strictly inside the word),
  // but never in a way that piles up a longer consonant cluster than the
  // original had. This keeps the classic subtle swaps (friend -> freind) and
  // rejects the unpronounceable ones (divide -> divdie, candy -> cadny).
  const lim = mutableLimit(word);
  for (let i = 1; i < lim - 1; i++) {
    if (word[i] === word[i + 1]) continue;
    // Never reorder two consonants. English cluster order is rigid — it allows
    // "nd" but never "dn" — so candy -> cadny reads as instantly fake. Vowel
    // order is far looser, which is why friend -> freind fools people.
    if (!isVowel(word[i]) && !isVowel(word[i + 1])) continue;
    const chars = word.split("");
    [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
    const cand = chars.join("");
    if (maxConsonantRun(cand) > baseRun) continue;
    out.push({ word: cand, type: "transpose" });
  }
  return out;
}

const GENERATORS = [vowelSwaps, degeminations, geminations, transpositions];

// English inflectional/derivational endings are rigidly spelled, so mutating
// inside one is a giveaway: "feeding" -> "feedeng" and "picked" -> "pickad"
// are spotted instantly. Mutations are confined to the stem instead, which
// yields far better fakes ("feeding" -> "feding").
const PROTECTED_SUFFIXES = [
  "ations", "ation", "ingly", "ments", "ically", "ility", "ement", "ment",
  "ness", "tion", "sion", "able", "ible", "less", "ful", "ing", "est", "ely",
  "ers", "ed", "es", "er", "ly",
];

// Index at which the protected tail begins; mutations must stay strictly below
// it. Only applied when it leaves a stem worth mutating.
function mutableLimit(word) {
  for (const suffix of PROTECTED_SUFFIXES) {
    if (word.length > suffix.length + 2 && word.endsWith(suffix)) {
      return word.length - suffix.length;
    }
  }
  return word.length - 1; // default: everything but the final letter
}

// A rough "how hard is this to spot" weight, used to bias selection by
// difficulty. Higher = subtler. (Tuned by feel; adjust freely.)
const SUBTLETY = {
  "vowel-swap": 2,
  geminate: 3,
  degeminate: 4,
  transpose: 4,
};

/**
 * Build the full set of valid fake candidates for a single real word.
 * @returns {Array<{word:string,type:string}>} deduped, non-word, != original
 */
export function fakeCandidates(word, dict) {
  const seen = new Set([word]);
  const out = [];
  for (const gen of GENERATORS) {
    for (const cand of gen(word)) {
      if (cand.word.length < 3) continue;
      if (seen.has(cand.word)) continue;
      if (!isPlausible(cand.word)) continue; // must still look like English
      if (dict.isWord(cand.word)) continue; // the crucial "not a real word" gate
      seen.add(cand.word);
      out.push(cand);
    }
  }
  return out;
}

// Levenshtein edit distance — used to guarantee the two words on screen read as
// genuinely different words rather than two spellings of the same one.
function editDistance(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr.slice();
  }
  return prev[b.length];
}

/**
 * Make one round: a real word and a fake word that are DISTINCT words.
 *
 * The fake is built from its own source word, unrelated to the real word shown
 * beside it — so the player can't win by diffing two near-identical strings.
 * They have to actually judge each word on its own: is this English or not?
 *
 *   real: "palace"   fake: "gardin"  (forged from "garden", never from "palace")
 *
 * Two guards keep the pair honest:
 *   - the fake's source word is never the displayed real word
 *   - the fake must be at least `minDistance` edits from the real word, so a
 *     coincidental near-miss never reads as "one is a typo of the other"
 *
 * @param {Dictionary} dict
 * @param {Rng} rng
 * @param {object} [opts]
 * @param {number} [opts.minLen=5]
 * @param {number} [opts.maxLen=9]
 * @param {number} [opts.difficulty=0.5]   0 = favor obvious fakes, 1 = favor subtle
 * @param {number} [opts.minDistance=3]    min edit distance between the two shown words
 * @param {number} [opts.maxLenDiff=3]     keep the pair visually balanced
 * @param {number} [opts.maxTries=60]
 * @returns {{real:string, fake:string, type:string, fakeSource:string} | null}
 */
export function makePair(dict, rng, opts = {}) {
  const {
    minLen = 5,
    maxLen = 9,
    tiers = null,
    difficulty = 0.5,
    minDistance = 3,
    maxLenDiff = 3,
    maxTries = 60,
  } = opts;
  const pool = dict.sourcePool({ minLen, maxLen, tiers });
  if (pool.length < 2) return null;

  for (let attempt = 0; attempt < maxTries; attempt++) {
    const real = pool[rng.int(0, pool.length - 1)];
    const fakeSource = pool[rng.int(0, pool.length - 1)];
    if (fakeSource === real) continue;
    if (Math.abs(fakeSource.length - real.length) > maxLenDiff) continue;

    const candidates = fakeCandidates(fakeSource, dict).filter(
      (c) => c.word !== real && editDistance(c.word, real) >= minDistance,
    );
    if (candidates.length === 0) continue;

    const chosen = weightedPick(candidates, rng, difficulty);
    return { real, fake: chosen.word, type: chosen.type, fakeSource };
  }
  return null;
}

// Pick a candidate, biasing toward subtler transformations as difficulty rises.
//
// Selection is TYPE-FIRST: choose a transformation type, then a candidate
// within it. Picking uniformly across the flat candidate list would let
// vowel-swap dominate (~70% of rounds) purely because it generates the most
// candidates — each interior vowel yields four alternatives — which makes the
// game monotonous regardless of the subtlety weights.
function weightedPick(candidates, rng, difficulty) {
  const d = Math.max(0, Math.min(1, difficulty));

  const byType = new Map();
  for (const c of candidates) {
    if (!byType.has(c.type)) byType.set(c.type, []);
    byType.get(c.type).push(c);
  }

  const types = [...byType.keys()];
  const weights = types.map((t) => 1 + d * (SUBTLETY[t] - 1));
  const total = weights.reduce((a, b) => a + b, 0);

  let r = rng.float() * total;
  let chosenType = types[types.length - 1];
  for (let i = 0; i < types.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      chosenType = types[i];
      break;
    }
  }

  const group = byType.get(chosenType);
  return group[rng.int(0, group.length - 1)];
}
