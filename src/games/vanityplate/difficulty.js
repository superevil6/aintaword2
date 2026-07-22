// Difficulty profiles for Vanity Plate.
//
// A day at any tier is a COURSE of HOLES plates played back to back, scored
// like golf: your word's length is your strokes, summed against the course par.
// One plate is over in a guess or two — far too short to feel like a daily — so
// the round is what gives the day its length and lets a bad hole be recovered.
//
// The one real axis is the PAR BAND: the length of the shortest everyday word.
// Easy plates hide a short common word (par 3–4); Hard plates force a longer
// tight word (par 5–6), where the gap between the word you first think of and
// the shortest one is widest. `minWords` rejects sparse plates so there is
// always more than one way in — see the fairness note in
// scripts/build-vanityplate-daily.mjs.
//
// Kept free of DOM imports so the builder and any verifier can read these
// numbers from Node, the way the other games' difficulty.js files do.

export const HOLES = 6;

export const DIFFICULTIES = {
  easy: {
    id: "easy",
    label: "Easy",
    course: "Sunday Drive",
    blurb: "Short plates hiding an everyday word",
    parBand: [3, 4],
    minWords: 40,
  },
  medium: {
    id: "medium",
    label: "Medium",
    course: "Cross Country",
    blurb: "The tight word is there — if you can find it",
    parBand: [4, 5],
    minWords: 30,
  },
  hard: {
    id: "hard",
    label: "Hard",
    course: "Rally Stage",
    blurb: "Long pars and the widest gap to the shortest word",
    parBand: [5, 6],
    minWords: 20,
  },
};

export const DIFFICULTY_ORDER = ["easy", "medium", "hard"];
export const DEFAULT_DIFFICULTY = "medium";

export function getDifficulty(id) {
  return DIFFICULTIES[id] || DIFFICULTIES[DEFAULT_DIFFICULTY];
}
