// Loads a precomputed daily set of colordrop boards.
//
// Each day is an immutable file holding the exact boards for every difficulty
// (see scripts/build-colordrop-daily.mjs). Loading it means the boards a player
// sees are the ones committed and proven uniquely solvable, not whatever the
// current generator would now produce. Loading is best-effort: if the file is
// missing, the game regenerates the identical boards from the same seed.

import { todayKey } from "../../core/daily.js";

const FORMAT = 1;
const cache = new Map();

/**
 * @returns {Promise<{date:string, v:number, sets:Record<string,object[]>}|null>}
 */
export async function loadDay(day = todayKey(), base = import.meta.env?.BASE_URL ?? "/") {
  if (cache.has(day)) return cache.get(day);

  let data = null;
  try {
    const res = await fetch(`${base}data/colordrop/${day}.json`);
    if (res.ok) {
      const json = await res.json();
      if (json && json.v === FORMAT && json.sets && typeof json.sets === "object") {
        data = json;
      }
    }
  } catch {
    /* offline, 404, malformed — fall back to seeded generation */
  }

  cache.set(day, data);
  return data;
}

/** The frozen boards for one difficulty, or null. */
export function setsFor(data, difficulty) {
  const set = data?.sets?.[difficulty];
  return Array.isArray(set) && set.length ? set : null;
}
