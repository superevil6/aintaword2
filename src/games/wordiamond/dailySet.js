// Loads a precomputed daily board.
//
// Each day is an immutable file holding the exact starting arrangement for
// every difficulty (see scripts/build-wordiamond-daily.mjs). Loading it means
// the board a player sees is the board that was committed, rather than
// whatever the current generator would produce — so improving the generator
// cannot rewrite a day somebody has already played.
//
// Loading is best-effort. If the day's file is missing — past the generated
// range, or a deploy hiccup — the game falls back to deriving the board from
// the bundled pool, which reproduces the identical board because the file was
// built from the same seeds.

import { todayKey } from "../../core/daily.js";

const FORMAT = 1;
const cache = new Map();

/**
 * @returns {Promise<{date:string, v:number, modes:Record<string,object>}|null>}
 */
export async function loadDay(day = todayKey(), base = import.meta.env?.BASE_URL ?? "/") {
  if (cache.has(day)) return cache.get(day);

  let data = null;
  try {
    const res = await fetch(`${base}data/wordiamond/${day}.json`);
    if (res.ok) {
      const json = await res.json();
      // Guard the shape: a stale or hand-edited file must not crash the game.
      if (json && json.v === FORMAT && json.modes && typeof json.modes === "object") {
        data = json;
      }
    }
  } catch {
    /* offline, 404, malformed — fall back to the bundled pool */
  }

  cache.set(day, data);
  return data;
}
