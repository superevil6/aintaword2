// Photon Finish — game module entry point.
//
// Registers the game with the hub registry. The hub calls mount() with a
// container element and an options object.

import "./photonfinish.css";
import { registerGame } from "../../core/registry.js";
import { DIFFICULTY_ORDER } from "./difficulty.js";
import { PhotonFinishGame } from "./game.js";
import { setPuzzleData } from "./board.js";
import { todaysResults } from "./results.js";

export default registerGame({
  id: "photonfinish",
  title: "Photon Finish",
  tagline: "Aim the light. Mix the brightness. Cross the line.",
  description:
    "Beams of light that start at neutral brightness, a field of gates that " +
    "brighten and dim them, and a finish line for each beam that wants one exact " +
    "level. Where two beams cross they push each other's brightness, so they " +
    "cannot be aimed one at a time — settle one and it pins the next.",
  accent: "#4ad9e4",
  tags: ["light", "spatial"],
  playedToday: () => Object.keys(todaysResults()).length > 0,
  difficulties: DIFFICULTY_ORDER,

  async mount(container, opts = {}) {
    // Loaded on demand so the ~0.5 MB of prebuilt daily boards stays out of the
    // initial bundle for players who never open this game. See board.js.
    const { PUZZLES } = await import("../../data/photonfinishPuzzles.js");
    setPuzzleData(PUZZLES);

    // No difficulty resolved here: the game opens on its own picker, the same
    // way the others do. Passing opts.difficulty skips into that tier.
    const game = new PhotonFinishGame(container, opts);
    return () => game.destroy();
  },
});
