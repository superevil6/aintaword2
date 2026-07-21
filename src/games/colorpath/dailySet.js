// Loads a precomputed daily board.
//
// Each day is an immutable file holding the exact layout for every difficulty
// (see scripts/build-colorpath-daily.mjs). Loading it means the board a player
// sees is the one that was committed and proven solvable, rather than whatever
// the current generator would now produce — so improving the generator cannot
// rewrite a day somebody has already played.
//
// Loading is best-effort. If the day's file is missing — past the generated
// range, or a deploy hiccup — the game generates the board from the same seed
// and gets the identical layout.

import { todayKey } from "../../core/daily.js";

const FORMAT = 1;
const cache = new Map();

/**
 * @returns {Promise<{date:string, v:number, sets:Record<string,object>}|null>}
 */
export async function loadDay(day = todayKey(), base = import.meta.env?.BASE_URL ?? "/") {
  if (cache.has(day)) return cache.get(day);

  let data = null;
  try {
    const res = await fetch(`${base}data/colorpath/${day}.json`);
    if (res.ok) {
      const json = await res.json();
      // Guard the shape: a stale or hand-edited file must not crash the game.
      if (json && json.v === FORMAT && json.sets && typeof json.sets === "object") {
        data = json;
      }
    }
  } catch {
    /* offline, 404, malformed — fall back to generating from the seed */
  }

  cache.set(day, data);
  return data;
}

/** The frozen layout for one difficulty, or null. */
export function layoutFor(data, difficulty) {
  const set = data?.sets?.[difficulty];
  if (!set || !Array.isArray(set.colors) || !Array.isArray(set.targets)) return null;
  return set;
}
