// Difficulty profiles for Mirrorword.
//
// Three tiers, each 120 seeds. Two difficulty axes are in play:
//   • board SIZE — 4×4 (Easy) vs 5×5 (Medium/Hard). Squares get sparser and
//     naive fills strand far more often as n grows.
//   • the erasable center HINT — Easy hands you one axis letter and Medium two;
//     Hard gives none, which alone drops you back into the ~99.8%-strand regime.
// So Easy and Hard sit a size apart, while Medium→Hard is the SAME 5×5 board
// stripped of its hint AND drawn from a steeper seed bar (spread ≥12 vs ≥7, so
// par demands the rare-letter square). 6×6 was dropped as a tier: only ~57
// six-letter seeds clear a decent bar — too few for 120. See the design notes.
//
// Each tier ships a curated list of SEEDS — the given top row (= left column) —
// vetted so the day's puzzle anchors several valid squares AND has real spread
// between the best- and worst-scoring square, so "find the highest-scoring
// square" is a genuine choice rather than a formality. That's the same "filter
// hard" discipline the other games use; the list is produced by
// scripts/build-mirrorword-seeds.mjs (Hard's list is disjoint from Medium's, so
// a given word never appears in both). Par is computed at runtime from the
// shipped word pool (engine.bestSquare), a single source of truth identical for
// everyone; the day picks one seed by date (see seedFor), same for all players.
//
// DOM-free so a verifier can read the numbers from Node, like the siblings.

import { hashSeed } from "../../core/rng.js";

export const DIFFICULTIES = {
  easy: {
    id: "easy",
    label: "Easy",
    size: 4,
    // How many center-diagonal cells are pre-filled as an erasable hint (drawn
    // from the day's optimal square, so keeping them never blocks par). Easy
    // gets one and Medium two — the tier that is meant to teach should not be
    // the one that starts from a blank axis. Hard alone gets none, which is
    // what makes it bite. See design notes on the 99.8% strand.
    //
    // One, not two: on a 4×4 there are only three free diagonal cells, so two
    // hints would be most of the spine and par would fall out nearly by itself.
    hint: 1,
    blurb: "A 4×4 square — a center letter to start you off",
    seeds: ["abet", "able", "aces", "ache", "acne", "babe", "baby", "bade", "bags", "bake", "cabs", "cage", "calf", "calk", "calm", "dabs", "dads", "dais", "dame", "dams", "each", "earl", "ease", "east", "eats", "face", "fact", "fads", "fake", "fame", "gabs", "gags", "gala", "gale", "gals", "hack", "hags", "half", "hall", "halt", "iced", "ices", "idea", "idle", "ills", "jabs", "jack", "jamb", "jams", "jaws", "keel", "keep", "kept", "kick", "kill", "labs", "lace", "lacy", "lade", "lady", "mace", "made", "maid", "maim", "male", "nabs", "nags", "nape", "naps", "neat", "oafs", "oaks", "oath", "oboe", "odes", "pace", "pack", "pads", "page", "pale", "race", "rack", "raft", "rage", "raid", "sack", "sacs", "saga", "sage", "said", "tabs", "tack", "tact", "tags", "talc", "undo", "unto", "urge", "urns", "user", "vane", "vans", "vase", "vast", "veal", "wade", "wads", "wage", "wags", "wake", "yaks", "yams", "yaps", "yard", "yens", "zany", "zeal", "zest", "zeta", "zips"],
  },
  medium: {
    id: "medium",
    label: "Medium",
    size: 5,
    hint: 2,
    blurb: "A 5×5 square — two center letters to start you off",
    seeds: ["aback", "abate", "abbot", "abets", "abler", "abode", "backs", "bacon", "baggy", "bails", "balds", "cabin", "cacti", "cadet", "calls", "camel", "daisy", "damps", "dance", "dares", "darts", "eager", "earth", "easel", "eases", "eater", "eaves", "faces", "facet", "faded", "fagot", "fails", "gales", "galls", "gamer", "games", "gamut", "habit", "hails", "hairs", "haler", "hales", "icons", "idles", "infer", "inter", "iotas", "jacks", "jaded", "jails", "jambs", "jells", "jests", "keeps", "kicks", "kites", "label", "laced", "laces", "laded", "lades", "maced", "macho", "madam", "mails", "maims", "nails", "named", "nasal", "natty", "nears", "needs", "oases", "oasis", "obese", "ocean", "octal", "paces", "packs", "pagan", "pager", "pails", "rabbi", "raced", "racer", "racks", "radar", "saber", "sacks", "safer", "sager", "sages", "tacit", "tacks", "tails", "taken", "tales", "talon", "ulcer", "ultra", "unman", "unset", "upped", "valet", "value", "vases", "vasts", "vents", "waded", "wafer", "wafts", "wages", "wails", "yacht", "yards", "yeast", "yells", "yeses", "yodel", "zeros"],
  },
  hard: {
    id: "hard",
    label: "Hard",
    size: 5,
    hint: 0,
    blurb: "A 5×5 square — no hints, and the rare-letter square to chase",
    seeds: ["abhor", "ached", "acres", "acted", "after", "ahead", "aides", "badge", "bales", "balls", "bards", "bared", "bares", "caper", "carat", "cards", "cares", "cargo", "carps", "dared", "dated", "dates", "deals", "dears", "death", "eased", "elect", "emits", "enema", "erase", "essay", "facts", "falls", "fared", "fares", "fasts", "fatal", "galas", "gases", "gasps", "gated", "gates", "gears", "halls", "hared", "hares", "harms", "harps", "harts", "image", "irate", "issue", "jades", "jawed", "karat", "labor", "laden", "lamer", "lames", "lamps", "lards", "maces", "males", "malls", "march", "mares", "marsh", "names", "nests", "nodes", "noses", "noted", "numbs", "oaths", "omega", "omits", "opted", "optic", "ousts", "pales", "palls", "papas", "paper", "pared", "pares", "races", "rapid", "rared", "rares", "rated", "rates", "sades", "salad", "sales", "saris", "sawed", "scabs", "tacos", "tames", "taper", "tarts", "taste", "teams", "upend", "upper", "usage", "users", "usher", "vests", "vista", "vomit", "voter", "wades", "waist", "wards", "warms", "warps", "wasps", "years", "yelps"],
  },
};

export const DIFFICULTY_ORDER = ["easy", "medium", "hard"];
export const DEFAULT_DIFFICULTY = "medium";

export function getDifficulty(id) {
  return DIFFICULTIES[id] || DIFFICULTIES[DEFAULT_DIFFICULTY];
}

// Coprime to every tier length (120, 48, …), so multiplying the day number by
// it walks a full-cycle permutation of the seed list: consecutive days never
// land on the same seed, and a puzzle only recurs after the whole list is used
// — matching how the pregenerated games hand out one distinct day at a time,
// rather than hash-picking (which can collide within days).
const STRIDE = 97;

/**
 * The seed for a given ISO day + tier — the same one for every player on that
 * date (UTC day number drives it, per core/daily.js). Strided-sequential, not
 * hashed, so the full pool is exhausted before any repeat and there are no
 * near-term duplicates.
 *
 * @param {object} profile a difficulty profile
 * @param {string} day     ISO date "YYYY-MM-DD"
 */
export function seedFor(profile, day) {
  const seeds = profile.seeds;
  const dayNum = Math.floor(Date.parse(day + "T00:00:00Z") / 86400000);
  const offset = hashSeed(profile.id) % seeds.length; // stagger tiers apart
  return seeds[(((dayNum * STRIDE + offset) % seeds.length) + seeds.length) % seeds.length];
}
