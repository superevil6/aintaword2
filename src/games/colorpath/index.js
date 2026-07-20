// Color Path — game module entry point.
//
// Registers the game with the hub registry.  The hub calls mount() with a
// container element and an options object.

import "./colorpath.css";
import { registerGame } from "../../core/registry.js";
import { ColorPathGame } from "./game.js";

export default registerGame({
  id:      "colorpath",
  title:   "Color Path",
  // The win condition is collecting every target, not reaching any particular
  // colour — an earlier tagline promised a "goal color" that does not exist.
  tagline: "Mix red, yellow and blue to reach every glowing circle.",
  description:
    "A grid of colored circles. Starting from white, choose which primary " +
    "color to add or remove at each step. Route through every glowing circle " +
    "— there is one in each quadrant — in as few moves as possible.",
  accent: "#e07818",

  async mount(container, opts = {}) {
    // No difficulty is resolved here: the game opens on its own picker, the
    // same way Ain't a Word does. Passing opts.difficulty skips straight into
    // that tier, and opts.seed overrides the daily seed for tests.
    const game = new ColorPathGame(container, opts);
    return () => game.destroy();
  },
});
