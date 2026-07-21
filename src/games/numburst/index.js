// Numburst — game module entry point.
//
// SCAFFOLDING. Registers the game so it appears on the hub and can be deep
// linked with ?game=numburst. Unlike the other three there is no daily file
// behind it yet: boards are generated at runtime from the day's seed, which
// gives every player the same board today but offers no guarantee the board is
// any good. Freezing days comes after scripts/build-numburst.mjs exists to
// prove a board is worth playing.

import "./numburst.css";
import { registerGame } from "../../core/registry.js";
import { NumburstGame } from "./game.js";

export default registerGame({
  id: "numburst",
  title: "Numburst",
  tagline: "Kill the big ones first — they take the neighbourhood with them.",
  description:
    "A cluster of numbered orbs, each drawn at the size of its number. You get " +
    "a handful of bombs and they subtract. An orb reduced to zero bursts, and " +
    "the bigger it was the further the burst reaches — so the order you spend " +
    "your bombs in decides how much of the board goes up with them.",
  accent: "#ff8a3d",

  async mount(container, opts = {}) {
    // No difficulty resolved here: the game opens on its own picker, the same
    // way Color Path and Ain't a Word do. Passing opts.difficulty skips into
    // that tier, and opts.seed overrides the daily seed for tests.
    const game = new NumburstGame(container, opts);
    return () => game.destroy();
  },
});
