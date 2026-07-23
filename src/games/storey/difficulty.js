// Difficulty profiles for Storey.
//
// A day at any tier is one HAND of distinct consonant letters and a GRAVITY, and
// the whole round is building the tallest, widest tower that hand allows —
// spelling floors using ONLY those letters (plus the always-free vowels). The
// three levers:
//
//   • HAND SIZE  — how many distinct consonants you get. More letters = more
//     words are spellable and more pillar pairs, so a taller tower is possible.
//   • GRAVITY    — how fast height gets expensive; higher gravity forces a
//     wider base and a sharper "is the next storey worth it?" decision.
//   • CONSONANTS — the alphabet a hand is drawn from. Easy hands use only the
//     common consonants; the Hard set admits the rarer letters, which spell
//     fewer words, so the hand has to be paired with more care.
//
// The build script samples hands from these and keeps the ones whose PAR lands
// in the tier's storey band, so Easy < Medium < Hard holds every day. Kept free
// of DOM imports so the builder and verifier can read these numbers from Node,
// the way the other games' difficulty.js files do.

// Common consonants: the workhorses that spell the most words.
const COMMON = [..."bcdfghlmnprst"];
// The full set adds the rare, high-friction letters.
const RARE = [..."jkvwxyz"];

export const DIFFICULTIES = {
  easy: {
    id: "easy",
    label: "Easy",
    site: "Cottage",
    blurb: "A small set of common letters — a few wide floors",
    hand: 8,
    gravity: 2,
    letters: COMMON,
    storeys: [3, 4],
  },
  medium: {
    id: "medium",
    label: "Medium",
    site: "Townhouse",
    blurb: "More letters, real gravity — decide how high to go",
    hand: 10,
    gravity: 2,
    letters: COMMON,
    storeys: [4, 5],
  },
  hard: {
    id: "hard",
    label: "Hard",
    site: "Tower Block",
    blurb: "A big, rare alphabet under light gravity — build sky-high",
    hand: 12,
    gravity: 1,
    letters: [...COMMON, ...RARE],
    storeys: [5, 6],
  },
};

export const DIFFICULTY_ORDER = ["easy", "medium", "hard"];
export const DEFAULT_DIFFICULTY = "medium";

export function getDifficulty(id) {
  return DIFFICULTIES[id] || DIFFICULTIES[DEFAULT_DIFFICULTY];
}
