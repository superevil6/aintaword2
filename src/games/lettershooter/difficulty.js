// Difficulty profiles for Letter Shooter.
//
// A run is five rounds; each round you build one word from scrolling rows. The
// levers that separate the tiers, all measured against the availability data:
//
//   • baseN       — letters per row (before depth-widening). WIDER rows keep more
//     words alive, so Easy hands you more options than Hard.
//   • baseSpeed   — how fast rows scroll. This is the "fake urgency" that makes
//     it fun; the fastest rows are auto-tamed 20% in the engine so quick reflexes
//     are never a wall.
//   • spread      — how much row speeds vary around the base.
//   • visibleRows — how far you can look ahead and plan your word.
//   • ramp        — how much faster rows get with each letter you add this word:
//     the greed pressure. Push a longer word, scroll faster.
//   • maxRows     — how deep the perfect-timing par search looks.
//
// Kept free of DOM imports so the builder and verifier can read these from Node,
// like the other games' difficulty.js files.

export const DIFFICULTIES = {
  easy: {
    id: "easy",
    label: "Easy",
    name: "Warm-Up",
    blurb: "Wide rows, gentle speed — plenty of room to spell",
    baseN: 7,
    baseSpeed: 95,
    spread: 40,
    visibleRows: 5,
    ramp: 8,
    rounds: 5,
    maxRows: 9,
  },
  medium: {
    id: "medium",
    label: "Medium",
    name: "Arcade",
    blurb: "Tighter rows, real pace — read ahead and commit",
    baseN: 6,
    baseSpeed: 125,
    spread: 45,
    visibleRows: 5,
    ramp: 12,
    rounds: 5,
    maxRows: 9,
  },
  hard: {
    id: "hard",
    label: "Hard",
    name: "Gauntlet",
    blurb: "Lean rows, quick walls, less look-ahead — nerve required",
    baseN: 6,
    baseSpeed: 160,
    spread: 50,
    visibleRows: 4,
    ramp: 16,
    rounds: 5,
    maxRows: 9,
  },
};

export const DIFFICULTY_ORDER = ["easy", "medium", "hard"];
export const DEFAULT_DIFFICULTY = "medium";

export function getDifficulty(id) {
  return DIFFICULTIES[id] || DIFFICULTIES[DEFAULT_DIFFICULTY];
}
