// Storey — game module entry point.
//
// Importing this file registers the game with the shared registry and pulls in
// its styles. main.js (or a hub) then mounts it via the descriptor.
//
// Like Vanity Plate, Storey needs the full ENABLE dictionary at runtime: the
// player types arbitrary words as floors, so validity is checked live. The day
// file carries only the hand and its precomputed par; the familiar pool par is
// measured over never ships.

import "./storey.css";
import { registerGame } from "../../core/registry.js";
import { DIFFICULTY_ORDER } from "./difficulty.js";
import { Dictionary } from "../../core/dictionary.js";
import { StoreyGame } from "./game.js";
import { loadDay } from "./dailySet.js";
import { todayKey, todaysResults } from "./results.js";

let sharedDict = null;
async function getDictionary(opts) {
  if (opts.dict) return opts.dict;
  if (!sharedDict) sharedDict = new Dictionary();
  await sharedDict.load();
  return sharedDict;
}

export default registerGame({
  id: "storey",
  title: "Storey",
  tagline: "Stack real words into a tower. Mind the gravity.",
  description:
    "Build a tower out of words. Each floor is a real word standing on two " +
    "consonant pillars from your daily hand of tiles — wider words pay more, but " +
    "every storey higher costs gravity, so build a wide base and stop while the " +
    "climb is still worth it. Reach the day's par, or top it with rarer words.",
  accent: "#d0553f",
  tags: ["word"],
  playedToday: () => Object.keys(todaysResults()).length > 0,
  difficulties: DIFFICULTY_ORDER,

  async mount(container, opts = {}) {
    const day = opts.day ?? todayKey();
    const [dict, daily] = await Promise.all([
      getDictionary(opts),
      opts.daily !== undefined ? Promise.resolve(opts.daily) : loadDay(day),
    ]);
    const game = new StoreyGame(container, { ...opts, dict, daily, day });
    return () => game.destroy();
  },
});
