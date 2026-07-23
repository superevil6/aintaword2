// Storey engine — the pure tower rules, free of any DOM.
//
// You are given a finite HAND of consonant tiles for the day (vowels are free
// and unlimited). You raise a tower one STOREY at a time: each storey is a
// FLOOR — a real word — laid across two pillars, and a word only fits when its
// FIRST and LAST letters are both consonants you still hold in the hand (those
// two tiles are the pillars; the middle is free scaffolding). Laying the floor
// spends those two tiles. A floor's raw worth is its WIDTH (its length), so
// wider words pay more.
//
// GRAVITY is what stops you building forever. The storey at height h (the base
// is h=0) costs `gravity*h` to support, so a floor's NET worth is
// `width - gravity*height`. Since the support of a whole tower of k storeys is
// gravity*(0+1+...+(k-1)) = gravity*k*(k-1)/2 no matter the order, the only
// thing order changes is WHICH floor pays which height — so you always want
// your widest floors at the bottom (a wide base, tapering up). The day's PAR is
// the highest net score reachable from the hand: the best way to pair the tiles
// into floors, take the widest familiar word for each pair, and stop building
// at the height where the next storey stops being worth its gravity.
//
// Kept DOM-free on purpose (like the other games' engines): scripts/lib-storey
// re-derives the same par under Node from the shipped familiar pool, so every
// player worldwide gets an identical, deterministic par.

/** The five vowels. Everything else a–z (including Y) is a consonant here. */
export const VOWELS = new Set([..."aeiou"]);

/** Shortest word that can be a floor — a two-letter word is not much of a room. */
export const MIN_FLOOR = 3;

/** Longest familiar word par will build with; longer/rarer words are the birdie ceiling. */
export const PAR_CAP = 9;

export function isVowel(ch) {
  return VOWELS.has(ch);
}
export function isConsonant(ch) {
  return /^[a-z]$/.test(ch) && !VOWELS.has(ch);
}

/**
 * The pillars a word would stand on: its first and last letters, provided the
 * word is long enough and both ends are consonants. Pure structure — no
 * dictionary, no hand. Returns `{ left, right, width }` or null.
 */
export function pillarsOf(word) {
  const w = String(word).toLowerCase();
  if (w.length < MIN_FLOOR) return null;
  const left = w[0];
  const right = w[w.length - 1];
  if (!isConsonant(left) || !isConsonant(right)) return null;
  return { left, right, width: w.length };
}

/**
 * The tile cost of a floor as a small map, e.g. { s:1, t:1 } — or { s:2 } when a
 * word starts and ends with the same consonant (SITARS). The two pillars are
 * the only tiles a floor spends.
 */
export function tileCost(left, right) {
  const cost = Object.create(null);
  cost[left] = (cost[left] || 0) + 1;
  cost[right] = (cost[right] || 0) + 1;
  return cost;
}

/** Does `rack` (a {tile:count} map) still hold every tile the pillars need? */
export function rackAffords(rack, left, right) {
  const need = tileCost(left, right);
  for (const t in need) if ((rack[t] || 0) < need[t]) return false;
  return true;
}

/** Turn a hand array (["t","n",...]) into a mutable {tile:count} rack. */
export function rackFromHand(hand) {
  const rack = Object.create(null);
  for (const t of hand) rack[t] = (rack[t] || 0) + 1;
  return rack;
}

/**
 * Is `word` a legal floor to lay right now? A floor is built ONLY from your
 * letters: every consonant in the word must be one of the hand's letters
 * (`handSet` — vowels are always free), and its two ends are the pillars, which
 * must still be un-spent tiles in `rack`. Checks in order: real word, long
 * enough and consonant-ended, every consonant in the pool, pillars affordable.
 * Returns `{ ok, left, right, width }` or `{ ok:false, reason, offLetter? }`.
 *
 * @param {string} word
 * @param {object} rack        {tile:count} of the pillar tiles still un-spent
 * @param {Set<string>} handSet the letters in play (the hand's distinct consonants)
 * @param {(w:string)=>boolean} isWord
 */
export function checkFloor(word, rack, handSet, isWord) {
  const w = String(word).toLowerCase();
  if (!isWord(w)) return { ok: false, reason: "not-a-word" };
  const p = pillarsOf(w);
  if (!p) return { ok: false, reason: "bad-ends" };
  for (const c of w) {
    if (isConsonant(c) && !handSet.has(c)) return { ok: false, reason: "off-pool", offLetter: c };
  }
  if (!rackAffords(rack, p.left, p.right)) return { ok: false, reason: "no-tiles" };
  return { ok: true, left: p.left, right: p.right, width: p.width };
}

/** A single floor's net worth: its width minus the gravity of its height. */
export function floorNet(width, height, gravity) {
  return width - gravity * height;
}

/** Total support any k-storey tower pays: gravity*(0+1+...+(k-1)). Order-free. */
export function towerGravity(k, gravity) {
  return gravity * (k * (k - 1)) / 2;
}

/**
 * A played tower's score: sum of floor widths minus the whole tower's gravity.
 * `floors` is an array of `{ width }` in build order; only the count matters to
 * gravity, so a re-ordering never changes the total (see the module header).
 */
export function scoreTower(floors, gravity) {
  const gross = floors.reduce((s, f) => s + f.width, 0);
  return gross - towerGravity(floors.length, gravity);
}

/**
 * The day's PAR + the optimal tower: the highest net score reachable from
 * `hand` under `gravity`, given `pairWord(a,b)` — the widest familiar floor with
 * left pillar `a`, right pillar `b`, as `{ width, word }` or null.
 *
 * It is a max-weight matching with a twist: the gravity a tower pays is convex
 * in the NUMBER of storeys, so we track, for every subset of tiles, the best
 * total width achievable with exactly k pairs, then pick the k whose
 * `width_sum - gravity*k*(k-1)/2` is largest. Hands are ≤~14 tiles, so the
 * 2^m subset DP is tiny and exact — no heuristic, a true par like mirrorword's.
 *
 * @returns {{par:number, stories:number, gross:number, floors:Array<{left,right,width,word}>}}
 *          floors ordered widest-first (the build order par assumes: base up).
 */
export function bestTower(hand, gravity, pairWord) {
  const m = hand.length;
  const K = Math.floor(m / 2);

  // Best floor (and its orientation) for each unordered tile pair (i,j).
  const val = Array.from({ length: m }, () => new Array(m).fill(null));
  for (let i = 0; i < m; i++)
    for (let j = i + 1; j < m; j++) {
      const a = pairWord(hand[i], hand[j]);
      const b = pairWord(hand[j], hand[i]);
      let best = null;
      if (a) best = { left: hand[i], right: hand[j], width: a.width, word: a.word };
      if (b && (!best || b.width > best.width))
        best = { left: hand[j], right: hand[i], width: b.width, word: b.word };
      val[i][j] = best;
    }

  // dp[mask][k] = max total width using exactly k disjoint pairs drawn from the
  // tiles in `mask`; -1 = unreachable. Ascending mask order is safe because
  // every predecessor (mask with bits cleared) is a smaller number.
  const size = 1 << m;
  const dp = new Array(size);
  const base = new Float64Array(K + 1).fill(-1);
  base[0] = 0;
  dp[0] = base;
  for (let mask = 1; mask < size; mask++) {
    let i = 0;
    while (!(mask & (1 << i))) i++;
    const cur = Float64Array.from(dp[mask & ~(1 << i)]); // leave i unpaired
    for (let j = i + 1; j < m; j++) {
      if (!(mask & (1 << j))) continue;
      const p = val[i][j];
      if (!p) continue;
      const sub = dp[mask & ~(1 << i) & ~(1 << j)];
      for (let k = 0; k < K; k++) {
        if (sub[k] < 0) continue;
        const c = sub[k] + p.width;
        if (c > cur[k + 1]) cur[k + 1] = c;
      }
    }
    dp[mask] = cur;
  }

  const full = size - 1;
  let bestNet = 0, bestK = 0; // k=0 (build nothing) always nets 0
  for (let k = 1; k <= K; k++) {
    if (dp[full][k] < 0) continue;
    const net = dp[full][k] - towerGravity(k, gravity);
    if (net > bestNet) { bestNet = net; bestK = k; }
  }

  // Walk the DP back out to the actual floors of the optimal (full, bestK).
  const floors = [];
  let mask = full, k = bestK;
  while (k > 0) {
    let i = 0;
    while (!(mask & (1 << i))) i++;
    if (dp[mask & ~(1 << i)][k] === dp[mask][k]) { mask &= ~(1 << i); continue; }
    let matched = false;
    for (let j = i + 1; j < m && !matched; j++) {
      if (!(mask & (1 << j))) continue;
      const p = val[i][j];
      if (!p) continue;
      const sub = dp[mask & ~(1 << i) & ~(1 << j)];
      if (sub[k - 1] >= 0 && sub[k - 1] + p.width === dp[mask][k]) {
        floors.push(p);
        mask &= ~(1 << i);
        mask &= ~(1 << j);
        k--;
        matched = true;
      }
    }
    if (!matched) mask &= ~(1 << i); // unreachable in practice; stay safe
  }
  floors.sort((x, y) => y.width - x.width || (x.word < y.word ? -1 : x.word > y.word ? 1 : 0));

  return { par: bestNet, stories: bestK, gross: bestK ? dp[full][bestK] : 0, floors };
}
