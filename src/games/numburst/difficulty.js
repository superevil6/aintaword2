// Difficulty profiles for Numburst.
//
// SCAFFOLDING — these numbers are guesses. The real ones come out of the
// solver: generate a board, brute-force the optimal score, and keep the board
// only if the greedy play falls meaningfully short of it. A tier where
// "always bomb the biggest orb" scores 95% of optimal is not a puzzle.
//
// Four axes so far:
//
//   1. Orb count   — how crowded the field is, which drives how often blasts
//      reach anything at all.
//   2. Max value   — the ceiling on orb size. A board of nothing but small orbs
//      has no big detonations to build toward.
//   3. Skew        — how hard the roll leans toward the floor (MIN_VALUE, which
//      is 2). Weight falls off as 1/value^skew, so skew 2 makes roughly two
//      thirds of the board 2s and a 9 a once-in-a-hundred landmark. This is
//      what fills the screen: lots of cheap orbs, a few that matter.
//
//      Note the floor is 2, not 1, and that is load-bearing. A 1 bursts for
//      nothing, so boards full of them were mostly dead ends. Every 2 passes on
//      1 damage, which is enough for cascades to percolate right across a
//      packed board — chains went from ~3 waves deep to well over ten.
//   4. Bombs       — the inventory. This is the scarcity that makes ordering
//      matter; everything else is just layout.
//
// Counts are high because orb AREA grows with the square of the value, so a
// field of mostly 1s takes a great many of them to fill a box. The settler
// packs them to the brim (see HEADROOM in board.js).
//
// Kept free of DOM imports so the eventual verifier can read the real numbers
// from Node, the way verify-colorpath.mjs reads colorpath/difficulty.js.

// A day at any tier is a MATCH of ROUNDS boards played back to back, the score
// carried across all of them. One board resolves in a shot or two — far too
// short to feel like a daily — so the run is what gives the day its length and
// lets a bad first board be recovered from.
export const ROUNDS = 3;

export const DIFFICULTIES = {
  easy: {
    id: "easy",
    label: "Easy",
    blurb: "A jar of twos, sixes the biggest thing in it",
    orbCount: 60,
    maxValue: 6,
    skew: 2,
    // Keyed by bomb value → how many you get.
    bombs: { 1: 3, 2: 2, 3: 1 },
  },
  medium: {
    id: "medium",
    label: "Medium",
    blurb: "Packed to the brim, with sevens buried in it",
    orbCount: 110,
    maxValue: 7,
    skew: 2,
    bombs: { 1: 3, 2: 2, 3: 1 },
  },
  hard: {
    id: "hard",
    label: "Hard",
    blurb: "Wall to wall, eights in the pile, and barely enough to arm",
    orbCount: 170,
    maxValue: 8,
    skew: 2.1,
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
