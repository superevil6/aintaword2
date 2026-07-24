// Sigil Sweep — game module entry point.
//
// Registers the game with the hub registry. The hub calls mount() with a
// container element and an options object.

import "./sigilsweep.css";
import { registerGame } from "../../core/registry.js";
import { DIFFICULTY_ORDER } from "./difficulty.js";
import { SigilSweepGame } from "./game.js";
import { loadDay } from "./dailySet.js";
import { todayKey, todaysResults } from "./results.js";

export default registerGame({
  id: "sigilsweep",
  title: "Sigil Sweep",
  tagline: "Read the mark from a rotating, half-mirrored sliver.",
  description:
    "A split line rotates through a hidden mark. One side shows the true slice; " +
    "the other mirrors it back, so half of what you see is a lie and nothing " +
    "lingers. Assemble the mark from memory and pick it out — the sooner you " +
    "commit, the more it scores.",
  accent: "#b98cff",
  tags: ["visual", "speed", "memory"],
  playedToday: () => Object.keys(todaysResults()).length > 0,
  difficulties: DIFFICULTY_ORDER,

  async mount(container, opts = {}) {
    const day = opts.day || todayKey();
    const daily = opts.daily ?? (await loadDay(day));
    const game = new SigilSweepGame(container, { ...opts, day, daily });
    return () => game.destroy();
  },
});
