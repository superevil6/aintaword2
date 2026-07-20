// Difficulty profiles.
//
// Difficulty is TWO axes, not one:
//
//   1. Word length  — longer words take longer to scan and verify.
//   2. Familiarity  — a SCOWL tier. This is the stronger lever: "information"
//      is 11 letters and instantly recognizable, while "opuses" is 6 and
//      baffling. Length alone would make Hard longer but not really harder.
//
// A third knob, `subtlety`, biases which transformations the generator favours
// (see SUBTLETY in wordSmith.js): low values prefer obvious fakes, high values
// prefer the ones people actually fall for.
//
// IMPORTANT: these are FIXED per run. Difficulty must not drift with the
// player's score — the daily challenge requires every player to see the same
// word sequence, and a score-dependent ramp would give a good player different
// words from a struggling one on the same seed.

export const DIFFICULTIES = {
  easy: {
    id: "easy",
    label: "Easy",
    blurb: "Short, everyday words",
    minLen: 5,
    maxLen: 6,
    tiers: ["10"], // most common vocabulary only
    subtlety: 0.15,
  },
  medium: {
    id: "medium",
    label: "Medium",
    blurb: "Longer words, a little less common",
    minLen: 6,
    maxLen: 10,
    tiers: ["10", "20"],
    subtlety: 0.55,
  },
  hard: {
    id: "hard",
    label: "Hard",
    blurb: "Long, unfamiliar words and the subtlest fakes",
    minLen: 10,
    maxLen: 15,
    tiers: ["10", "20", "35"],
    subtlety: 1,
  },
};

export const DIFFICULTY_ORDER = ["easy", "medium", "hard"];
export const DEFAULT_DIFFICULTY = "medium";

export function getDifficulty(id) {
  return DIFFICULTIES[id] || DIFFICULTIES[DEFAULT_DIFFICULTY];
}
