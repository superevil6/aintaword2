// Wordiamond — game module entry point.
//
// Registers the game with the hub registry. The hub calls mount() with a
// container element and an options object.

import "./wordiamond.css";
import { registerGame } from "../../core/registry.js";
import { WordiamondGame } from "./game.js";
import { loadDay } from "./dailySet.js";
import { todaysResults } from "./results.js";

export default registerGame({
  id: "wordiamond",
  title: "Wordiamond",
  tagline: "Words share their corners. Rotate one side and two others break.",
  description:
    "A ring of words around a shape, sharing their corner letters. Rotating one " +
    "side drags its neighbors' corners with it, so nothing can be solved in " +
    "isolation. One word is given; land the rest, locking each as you find it. " +
    "Any real words win — not just the ones it was built from. Three shapes: a " +
    "square of three-letter words, a square of four, and a pentagon.",
  accent: "#5b8ff5",
  tags: ["word", "grid"],
  playedToday: () => Object.keys(todaysResults()).length > 0,

  async mount(container, opts = {}) {
    // Loaded on demand so the puzzle pools and the word lists — needed at
    // runtime because ANY valid ring wins, not just the intended one — stay
    // out of the initial bundle for players who never open this game.
    const data = await import("../../data/wordiamondPuzzles.js");
    // Today's frozen boards, if they have been generated. Best-effort: the
    // game derives the same boards from the pool when the file is absent.
    const day = await loadDay(opts.day);
    const game = new WordiamondGame(container, { ...data, day }, opts);
    return () => game.destroy();
  },
});
