// Ain't a Word — game module entry point.
//
// Importing this file registers the game with the shared registry and pulls in
// its styles. A hub page (or main.js) then mounts it via the descriptor.

import "./aintaword.css";
import { registerGame } from "../../core/registry.js";
import { Dictionary } from "../../core/dictionary.js";
import { AintAWordGame } from "./game.js";

// A dictionary can be shared across games; allow callers to pass one in, else
// lazily create and cache a single instance here.
let sharedDict = null;
async function getDictionary(opts) {
  if (opts.dict) return opts.dict;
  if (!sharedDict) sharedDict = new Dictionary();
  await sharedDict.load();
  return sharedDict;
}

export default registerGame({
  id: "aintaword",
  title: "Ain't a Word",
  tagline: "One word is real, one is a fake. Spot the real one.",
  description:
    "A 60-second score attack. Two words appear — one genuine, one a plausible " +
    "forgery of a real word. Pick the real word to score; a wrong pick burns a " +
    "second off a clock that never stops.",
  accent: "#7c5cff",

  async mount(container, opts = {}) {
    const dict = await getDictionary(opts);
    const game = new AintAWordGame(container, dict, opts);
    return () => game.destroy();
  },
});
