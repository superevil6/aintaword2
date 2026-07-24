// Difficulty metadata for sigilsweep (UI-facing).
//
// The board shape per tier — wedge, symmetry, stroke count, option count —
// lives in generator.js TIERS, the DOM-free module the build/verify scripts
// import. This module carries only what the picker shows plus the round length,
// and stays importable from Node (no CSS, no DOM) so the verifier can read it.

export const DIFFICULTIES = {
  easy: {
    id: "easy",
    label: "Easy",
    blurb: "The whole mark shows at once, mirror-symmetric. Read it and commit.",
    rounds: 5,
  },
  medium: {
    id: "medium",
    label: "Medium",
    blurb: "A narrow slit sweeps the mark — but it is still mirror-symmetric.",
    rounds: 5,
  },
  hard: {
    id: "hard",
    label: "Hard",
    blurb: "A narrow slit, and the mark is asymmetric — the reflection lies.",
    rounds: 5,
  },
};

export const DIFFICULTY_ORDER = ["easy", "medium", "hard"];
export const DEFAULT_DIFFICULTY = "medium";

export function getDifficulty(id) {
  return DIFFICULTIES[id] || DIFFICULTIES[DEFAULT_DIFFICULTY];
}
