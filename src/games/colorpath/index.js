// Color Path — game module entry point.
//
// Registers the game with the hub registry.  The hub calls mount() with a
// container element and an options object.

import { registerGame } from "../../core/registry.js";
import { ColorPathGame } from "./game.js";

const DIFFICULTIES = {
  easy:   { size: 5, targetCount: 3 },
  medium: { size: 7, targetCount: 4 },
  hard:   { size: 9, targetCount: 5 },
};

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
    const diffKey  = opts.difficulty ?? "medium";
    const diff     = DIFFICULTIES[diffKey] ?? DIFFICULTIES.medium;
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
