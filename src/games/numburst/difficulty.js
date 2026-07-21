// Difficulty profiles for Numburst.
//
// SCAFFOLDING — these numbers are guesses. The real ones come out of the
// solver: generate a board, brute-force the optimal score, and keep the board
// only if the greedy play falls meaningfully short of it. A tier where
// "always bomb the biggest orb" scores 95% of optimal is not a puzzle.
//
// Three axes so far:
//
//   1. Orb count   — how crowded the field is, which drives how often blasts
//      reach anything at all.
//   2. Max value   — the spread of orb sizes. A board of all 1s and 2s has no
//      big detonations to build toward.
//   3. Bombs       — the inventory. This is the scarcity that makes ordering
//      matter; everything else is just layout.
//
// Kept free of DOM imports so the eventual verifier can read the real numbers
// from Node, the way verify-colorpath.mjs reads colorpath/difficulty.js.

export const DIFFICULTIES = {
  easy: {
    id: "easy",
    label: "Easy",
    blurb: "A loose cluster and bombs to spare",
    orbCount: 14,
    maxValue: 5,
    // Keyed by bomb value → how many you get.
    bombs: { 1: 3, 2: 2, 3: 1 },
  },
  medium: {
    id: "medium",
    label: "Medium",
    blurb: "Tighter packing, and one big orb you cannot afford to waste",
    orbCount: 20,
    maxValue: 7,
    bombs: { 1: 3, 2: 2, 3: 1 },
  },
  hard: {
    id: "hard",
    label: "Hard",
    blurb: "A crowded field, nines in it, and barely enough to arm",
    orbCount: 28,
    maxValue: 9,
    bombs: { 1: 2, 2: 2, 3: 1 },
  },
};

export const DIFFICULTY_ORDER = ["easy", "medium", "hard"];
export const DEFAULT_DIFFICULTY = "medium";

export function getDifficulty(id) {
  return DIFFICULTIES[id] || DIFFICULTIES[DEFAULT_DIFFICULTY];
}

/** Bomb values a profile hands out, low to high. */
export function bombValues(profile) {
  return Object.keys(profile.bombs).map(Number).sort((a, b) => a - b);
}
