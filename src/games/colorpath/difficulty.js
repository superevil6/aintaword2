// Difficulty profiles for Color Path.
//
// Two axes, and they compound rather than add:
//
//   1. Grid size    — a longer perimeter means a longer solution path and
//      more branch points per move.
//   2. Target count — the three corners are always targets; anything beyond
//      that is spread along the path, forcing extra detours.
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
  easy:   { id: "easy",   label: "Easy",   size: 6, targetCount: 3 },
  medium: { id: "medium", label: "Medium", size: 7, targetCount: 4 },
  hard:   { id: "hard",   label: "Hard",   size: 8, targetCount: 5 },
};

export const DEFAULT_DIFFICULTY = "medium";
