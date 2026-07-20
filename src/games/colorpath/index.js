// Color Path — game module entry point.
//
// Registers the game with the hub registry.  The hub calls mount() with a
// container element and an options object.

import { registerGame } from "../../core/registry.js";
import { ColorPathGame } from "./game.js";
import { DIFFICULTIES, DEFAULT_DIFFICULTY } from "./difficulty.js";

export default registerGame({
  id:      "colorpath",
  title:   "Color Path",
  tagline: "Mix your way from white to the goal color.",
  description:
    "A grid of colored circles. Starting from white, choose which primary " +
    "color to add or remove at each step. Navigate to the bottom-right goal " +
    "in as few moves as possible.",
  accent: "#e07818",

  async mount(container, opts = {}) {
    const diffKey  = opts.difficulty ?? DEFAULT_DIFFICULTY;
    const diff     = DIFFICULTIES[diffKey] ?? DIFFICULTIES[DEFAULT_DIFFICULTY];
    const today    = new Date().toISOString().slice(0, 10);
    const seed     = `colorpath:${today}:${diffKey}`;

    const game = new ColorPathGame(container, {
      size: diff.size,
      targetCount: diff.targetCount,
      seed,
    });
    return () => game.destroy();
  },
});
