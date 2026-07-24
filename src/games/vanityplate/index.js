// Vanity Plate — game module entry point.
//
// Importing this file registers the game with the shared registry and pulls in
// its styles. main.js (or a hub) then mounts it via the descriptor.
//
// Unlike Ain't a Word, Vanity Plate needs the full validity dictionary EVERY
// time: the player types arbitrary words, so there is no "precomputed pairs"
// path that lets us skip the load. The day file carries only the plates and
// their par; the ~1.7MB ENABLE list (shared with the other games) is what
// checks a guess is a real word and lets a rarer, shorter one count as a birdie.

import "./vanityplate.css";
import { registerGame } from "../../core/registry.js";
import { DIFFICULTY_ORDER } from "./difficulty.js";
import { Dictionary } from "../../core/dictionary.js";
import { VanityPlateGame } from "./game.js";
import { loadDay } from "./dailySet.js";
import { todayKey, todaysResults } from "./results.js";

// One dictionary can be shared across games; accept an injected one (tests,
// or a hub that preloads), else lazily create and cache a single instance.
let sharedDict = null;
async function getDictionary(opts) {
  if (opts.dict) return opts.dict;
  if (!sharedDict) sharedDict = new Dictionary();
  await sharedDict.load();
  return sharedDict;
}

export default registerGame({
  id: "vanityplate",
  title: "Vanity Plate",
  tagline: "Three letters, in order. Shortest word wins.",
  description:
    "Word golf on a license plate. Every plate hides a word whose three letters " +
    "must appear in order — TRK → TRUCK, TREK, TURKEY. Par is the shortest " +
    "everyday word; find a rarer, shorter one for a birdie. Six plates a day, " +
    "scored like a round of golf.",
  accent: "#f4c430",
  tags: ["word"],
  playedToday: () => Object.keys(todaysResults()).length > 0,
  difficulties: DIFFICULTY_ORDER,

  async mount(container, opts = {}) {
    const day = opts.day ?? todayKey();
    const [dict, daily] = await Promise.all([
      getDictionary(opts),
      opts.daily !== undefined ? Promise.resolve(opts.daily) : loadDay(day),
    ]);
    const game = new VanityPlateGame(container, { ...opts, dict, daily, day });
    return () => game.destroy();
  },
});
