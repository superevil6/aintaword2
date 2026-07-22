// Difficulty profiles for Rootword.
//
// A tier is a letter-count k and a branch budget N. Both are real, measured
// difficulty axes: par climbs almost linearly with N (no saturation, unlike a
// scramble depth), and k widens the reachable tree. See the design notes for
// the full state-space measurements.
//
// Each tier ships a curated list of RACKS — {letters, seed} pairs vetted so the
// day's puzzle lands in a tight par band (rejecting sparse sets is the same
// "filter hard" discipline the other games use). The day picks one rack by a
// deterministic hash of (date + tier), so every player worldwide gets the same
// puzzle. Par itself is computed at runtime from the shipped word pool (see
// engine.optimalPar) — a single source of truth, identical for everyone.
//
// DOM-free so a verifier can read the numbers from Node, like the siblings.

import { hashSeed } from "../../core/rng.js";

export const DIFFICULTIES = {
  easy: {
    id: "easy",
    label: "Easy",
    blurb: "Seven letters, ten branches — a friendly little tree",
    budget: 10,
    racks: [
      { letters: "aeilnrs", seed: "era" },
      { letters: "ademprs", seed: "see" },
      { letters: "aelmrsw", seed: "era" },
      { letters: "aegnors", seed: "ear" },
      { letters: "aefmnst", seed: "tea" },
      { letters: "adekors", seed: "red" },
      { letters: "adejlps", seed: "pal" },
      { letters: "aeilprs", seed: "pal" },
      { letters: "aflopsy", seed: "pal" },
      { letters: "aehirst", seed: "tar" },
      { letters: "ehinstu", seed: "tee" },
      { letters: "adeimrs", seed: "mar" },
      { letters: "aceprsu", seed: "par" },
      { letters: "ejmnost", seed: "tee" },
      { letters: "ehirstu", seed: "tee" },
      { letters: "aehlpsy", seed: "pal" },
      { letters: "aefinrs", seed: "era" },
      { letters: "adelnrs", seed: "sad" },
      { letters: "acenprs", seed: "par" },
      { letters: "adeorsy", seed: "red" },
      { letters: "aemrsty", seed: "tar" },
      { letters: "aceiprs", seed: "par" },
      { letters: "acemors", seed: "era" },
      { letters: "adegirs", seed: "era" },
      { letters: "ademsty", seed: "mat" },
      { letters: "egnstuz", seed: "tee" },
    ],
  },
  medium: {
    id: "medium",
    label: "Medium",
    blurb: "Eight letters, fourteen branches — room to plan a trunk",
    budget: 14,
    racks: [
      { letters: "adeknpst", seed: "pas" },
      { letters: "aeimprst", seed: "par" },
      { letters: "aejnprsu", seed: "par" },
      { letters: "aefglrst", seed: "sag" },
      { letters: "adeprsxy", seed: "see" },
      { letters: "acdenrst", seed: "can" },
      { letters: "adehkmrs", seed: "she" },
      { letters: "aefikprs", seed: "see" },
      { letters: "acemprsy", seed: "par" },
      { letters: "aceprswx", seed: "par" },
      { letters: "aefmnprs", seed: "see" },
      { letters: "aeknpsty", seed: "pas" },
      { letters: "adehorsv", seed: "era" },
      { letters: "adeilpqs", seed: "lap" },
      { letters: "aeprstxy", seed: "par" },
      { letters: "acehnstu", seed: "tea" },
      { letters: "adeimprs", seed: "see" },
      { letters: "ceimoprs", seed: "pie" },
      { letters: "beimrstu", seed: "bus" },
      { letters: "acdefhst", seed: "tea" },
      { letters: "aehkprsu", seed: "she" },
      { letters: "acehjrst", seed: "tea" },
      { letters: "adekoprs", seed: "pro" },
      { letters: "aemnostw", seed: "tea" },
      { letters: "adeoprst", seed: "pas" },
      { letters: "adenorsx", seed: "ear" },
    ],
  },
  hard: {
    id: "hard",
    label: "Hard",
    blurb: "Ten letters, twenty-two branches — a whole orchard to pack",
    budget: 22,
    racks: [
      { letters: "adehikrstv", seed: "tar" },
      { letters: "acdefgirst", seed: "tea" },
      { letters: "acelmnprsy", seed: "car" },
      { letters: "cdefhilost", seed: "the" },
      { letters: "adehijprst", seed: "she" },
      { letters: "abegklprsz", seed: "spa" },
      { letters: "adekmoprst", seed: "pro" },
      { letters: "aefhklmrst", seed: "the" },
      { letters: "adeghmnrsv", seed: "mad" },
      { letters: "adefilnstw", seed: "den" },
      { letters: "abdeghmors", seed: "her" },
      { letters: "aehnoprswy", seed: "she" },
      { letters: "abceprsvyz", seed: "spa" },
      { letters: "acehlmoqst", seed: "mat" },
      { letters: "aegijnpstv", seed: "pan" },
      { letters: "adegkqrsyz", seed: "era" },
      { letters: "abcenrstvy", seed: "car" },
      { letters: "adejknoqst", seed: "tea" },
      { letters: "adegklmnrs", seed: "dam" },
      { letters: "adefhnostw", seed: "see" },
      { letters: "bdekmoprsw", seed: "boo" },
      { letters: "adeilnrsvx", seed: "din" },
      { letters: "abceghlsty", seed: "she" },
      { letters: "adeirstwyz", seed: "sea" },
      { letters: "cegikmprsz", seed: "pie" },
      { letters: "acdefprswy", seed: "par" },
    ],
  },
};

export const DIFFICULTY_ORDER = ["easy", "medium", "hard"];
export const DEFAULT_DIFFICULTY = "medium";

export function getDifficulty(id) {
  return DIFFICULTIES[id] || DIFFICULTIES[DEFAULT_DIFFICULTY];
}

/**
 * The rack for a given day + tier — the same one for every player on that date.
 * A hash of the seed string indexes the curated list, so the choice is stable
 * and evenly spread rather than marching through the list in calendar order.
 */
export function rackFor(profile, seedStr) {
  const racks = profile.racks;
  return racks[hashSeed(seedStr) % racks.length];
}
