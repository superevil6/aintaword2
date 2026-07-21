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
import { loadDay } from "./dailySet.js";

export default registerGame({
  id: "numburst",
  title: "Numburst",
  tagline: "Burst the big ones — they take everything they touch with them.",
  description:
    "A jar of numbered orbs, each drawn at the size of its number. You get a " +
    "handful of bombs and they subtract. An orb reduced to zero bursts, hitting " +
    "every orb it touches for one less than it was worth, which can set off the " +
    "next — and every step outward multiplies what those kills are worth. The " +
    "direct hit is never the answer; finding the orb that starts the longest " +
    "cascade is.",
  accent: "#ff8a3d",

  async mount(container, opts = {}) {
    // No difficulty resolved here: the game opens on its own picker, the same
    // way Color Path and Ain't a Word do. Passing opts.difficulty skips into
    // that tier, and opts.seed overrides the daily seed for tests.
    //
    // Today's frozen match, if it has been generated. Best-effort: the game
    // regenerates the same boards from the seed when the file is absent, only
    // without a par score.
    const daily = opts.daily ?? (await loadDay());
    const game = new NumburstGame(container, { ...opts, daily });
    return () => game.destroy();
  },
});
