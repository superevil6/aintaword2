// Difficulty profiles for Color Path.
//
// Two axes, and they compound rather than add:
//
//   1. Grid size    — a bigger board means a longer solution path and more
//      branch points per move.
//   2. Target count — targets are spread one per quadrant, so each extra one
//      forces another crossing of the board.
//
// Measured search cost to solve (see scripts/verify-colorpath.mjs) runs
// roughly 250 / 2,750 / 91,000 nodes across the three tiers — each step is
// an order of magnitude, so the curve is steep rather than linear.
//
// Note that easy carries only three targets against four quadrants, so one
// quadrant is deliberately left empty there. The verifier asserts
// min(4, targetCount) quadrants rather than always four.
//
// Kept in its own module so the verifier can import the real numbers — the
// game entry point pulls in CSS and cannot be loaded from Node.

export const DIFFICULTIES = {
  easy: {
    id: "easy",
    label: "Easy",
    blurb: "A roomy board and three circles to collect",
    size: 6,
    targetCount: 3,
  },
  medium: {
    id: "medium",
    label: "Medium",
    blurb: "A wider grid with a circle in every quadrant",
    size: 7,
    targetCount: 4,
  },
  hard: {
    id: "hard",
    label: "Hard",
    blurb: "The full board, five circles, and no slack",
    size: 8,
    targetCount: 5,
  },
};

export const DIFFICULTY_ORDER = ["easy", "medium", "hard"];
export const DEFAULT_DIFFICULTY = "medium";

export function getDifficulty(id) {
  return DIFFICULTIES[id] || DIFFICULTIES[DEFAULT_DIFFICULTY];
}
