// Letter Shooter — game module entry point.
//
// Importing this file registers the game with the shared registry and pulls in
// its styles. main.js (or a hub) then mounts it via the descriptor.
//
// Letter Shooter needs a PREFIX query at runtime (grabbing a dead-end letter is
// an instant bust), which core/dictionary.js doesn't provide — so it loads its
// own lexicon (isWord + isPrefix) from the same ENABLE text file. The day file
// carries only the ammo letters and the precomputed par; the rows regenerate
// from the day's seed on the client.

import "./lettershooter.css";
import { registerGame } from "../../core/registry.js";
import { DIFFICULTY_ORDER } from "./difficulty.js";
import { loadLexicon } from "./lexicon.js";
import { LetterShooterGame } from "./game.js";
import { loadDay } from "./dailySet.js";
import { todayKey, todaysResults } from "./results.js";

let sharedLex = null;
async function getLexicon(opts) {
  if (opts.dict) return opts.dict;
  if (!sharedLex) sharedLex = loadLexicon();
  return sharedLex;
}

export default registerGame({
  id: "lettershooter",
  title: "Letter Shooter",
  tagline: "Shoot letters off scrolling walls to build words.",
  description:
    "Walls of letters scroll past a firing beam. Time your shots to grab one " +
    "letter from each row and build a word — but grab a dead end and it busts. " +
    "Read the rows ahead, cash a real word before it's killed, and push your " +
    "luck across five rounds. Everyone plays the same daily board.",
  accent: "#7c5cff",
  tags: ["word"],
  playedToday: () => Object.keys(todaysResults()).length > 0,
  difficulties: DIFFICULTY_ORDER,

  async mount(container, opts = {}) {
    const day = opts.day ?? todayKey();
    const [dict, daily] = await Promise.all([
      getLexicon(opts),
      opts.daily !== undefined ? Promise.resolve(opts.daily) : loadDay(day),
    ]);
    const game = new LetterShooterGame(container, { ...opts, dict, daily, day });
    return () => game.destroy();
  },
});
