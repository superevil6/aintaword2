// Difficulty metadata for colordrop (UI-facing).
//
// The actual board shape per tier — depth, negatives — lives in generator.js
// TIERS, which is the DOM-free module the build/verify scripts import. This
// module carries only what the picker shows, plus how many boards make a
// round. Kept importable from Node (no CSS, no DOM) so the verifier can read
// the round length.

export const DIFFICULTIES = {
  easy: {
    id: "easy",
    label: "Easy",
    blurb: "Two rows of walls, four lanes. Add colors, drop fast.",
    boards: 5,
  },
  medium: {
    id: "medium",
    label: "Medium",
    blurb: "Three rows, eight lanes — and minus gates that subtract a color.",
    boards: 5,
  },
  hard: {
    id: "hard",
    label: "Hard",
    blurb: "Secondary-color gates: a wall can add or subtract two colors at once.",
    boards: 5,
  },
};

export const DIFFICULTY_ORDER = ["easy", "medium", "hard"];
export const DEFAULT_DIFFICULTY = "medium";

export function getDifficulty(id) {
  return DIFFICULTIES[id] || DIFFICULTIES[DEFAULT_DIFFICULTY];
}
