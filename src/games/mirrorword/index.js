// Mirrorword — game module entry point.
//
// Registers the game with the hub registry. The hub calls mount() with a
// container element and an options object.

import "./mirrorword.css";
import { registerGame } from "../../core/registry.js";
import { MirrorwordGame } from "./game.js";

export default registerGame({
  id: "mirrorword",
  title: "Mirrorword",
  tagline: "A mirror down the diagonal — every letter reflects into a word.",
  description:
    "Fill a grid so every row is a real word. A mirror runs down the diagonal, so " +
    "each letter you place is reflected across it — every row and its matching " +
    "column are the same word. Many squares are valid, but rarer letters score " +
    "more, and off the diagonal they count double. Find the highest-scoring " +
    "square you can, up to the day's par. A daily puzzle in three sizes.",
  accent: "#49c6e0",

  async mount(container, opts = {}) {
    // Loaded on demand so the word pool stays out of the initial bundle for
    // players who never open this game. It doubles as Mirrorword's runtime
    // validity set (any valid square wins) and the source for computing par —
    // deterministic and identical for every player worldwide.
    const { WORDS } = await import("../../data/rootwordPool.js");
    const game = new MirrorwordGame(container, { ...opts, pool: WORDS });
    return () => game.destroy();
  },
});
