// Rootword — game module entry point.
//
// Registers the game with the hub registry. The hub calls mount() with a
// container element and an options object.

import "./rootword.css";
import { registerGame } from "../../core/registry.js";
import { RootwordGame } from "./game.js";
import { loadDay } from "./dailySet.js";

export default registerGame({
  id: "rootword",
  title: "Rootword",
  tagline: "Grow a word tree — share the branches, pack the fruit.",
  description:
    "From a single seed word, grow a branching tree of words. Each branch adds " +
    "a letter and every path that spells a word bears fruit; words that start " +
    "the same share a branch. With a fixed number of branches, the game is " +
    "finding one fertile trunk and packing the most fruit onto it — up to the " +
    "day's true best score, its par.",
  accent: "#4fc978",

  async mount(container, opts = {}) {
    // Loaded on demand so the ~45 KB gzipped word pool stays out of the initial
    // bundle for players who never open this game. The pool is the single
    // source of truth for which branches are live and for computing par, so it
    // is deterministic and identical for every player worldwide.
    const { WORDS } = await import("../../data/rootwordPool.js");
    // Today's frozen puzzle set, if it has been generated. Best-effort: the
    // game falls back to the curated racks in difficulty.js when it is absent.
    const daily = opts.daily ?? (await loadDay());
    const game = new RootwordGame(container, { ...opts, pool: WORDS, daily });
    return () => game.destroy();
  },
});
