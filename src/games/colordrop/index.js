// Colordrop — game module entry point.
//
// Registers the game with the hub registry. The hub calls mount() with a
// container element and an options object.

import "./colordrop.css";
import { registerGame } from "../../core/registry.js";
import { DIFFICULTY_ORDER } from "./difficulty.js";
import { ColorDropGame } from "./game.js";
import { loadDay } from "./dailySet.js";
import { todayKey, todaysResults } from "./results.js";

export default registerGame({
  id: "colordrop",
  title: "Colordrop",
  tagline: "Drop the white ball down the chute that mixes to the goal color.",
  description:
    "A white ball and a goal color. Each chute is a stack of gates that add or " +
    "subtract red, yellow and blue. Read the chutes, drop the ball into the one " +
    "that mixes to the goal — the faster you commit, the more it scores.",
  accent: "#d84a94",
  tags: ["color", "speed"],
  playedToday: () => Object.keys(todaysResults()).length > 0,
  difficulties: DIFFICULTY_ORDER,

  async mount(container, opts = {}) {
    const day = opts.day || todayKey();
    const daily = opts.daily ?? (await loadDay(day));
    const game = new ColorDropGame(container, { ...opts, day, daily });
    return () => game.destroy();
  },
});
