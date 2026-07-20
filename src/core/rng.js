// Small, fast, seedable PRNG utilities.
//
// Everything the game randomizes (word selection, which transformation to
// apply, left/right placement) goes through a single seeded RNG instance so a
// run can be made fully reproducible — that's what powers a future "daily
// challenge" or a shareable seed, and it keeps the fake-word generator
// deterministic for a given (word, seed) as the design calls for.

// Hash an arbitrary string into a 32-bit integer seed (xfnv1a).
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  }
  // extra avalanche
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return h >>> 0;
}

// mulberry32: tiny, decent-quality 32-bit PRNG. Returns a function that yields
// floats in [0, 1).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A convenience wrapper with the helpers the game actually reaches for.
export class Rng {
  constructor(seed) {
    this.seed = typeof seed === "number" ? seed >>> 0 : hashSeed(String(seed));
    this._next = mulberry32(this.seed);
  }

  // float in [0, 1)
  float() {
    return this._next();
  }

  // integer in [min, max] inclusive
  int(min, max) {
    return min + Math.floor(this._next() * (max - min + 1));
  }

  // random element of an array
  pick(arr) {
    return arr[Math.floor(this._next() * arr.length)];
  }

  // true with the given probability
  chance(p) {
    return this._next() < p;
  }

  // in-place Fisher-Yates shuffle (returns the same array)
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this._next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

// A daily seed string like "2026-07-19" from a Date (defaults to now).
export function dailySeed(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
