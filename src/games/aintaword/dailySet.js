// Loads a precomputed daily challenge set.
//
// Each day is an immutable file of ready-made, already-validated word pairs
// (see scripts/build-daily.mjs). Using it means the client needs NEITHER the
// ~36k-word source pool NOR the ~440KB validity dictionary — the hard work
// happened at build time. That's the difference between a ~15KB load and a
// ~550KB one for the mode almost everyone plays.
//
// Loading is best-effort: if the day's file is missing (past the generated
// range, or a deploy hiccup) callers fall back to runtime generation, which
// then pulls in the heavy assets on demand.

import { todayKey } from "./results.js";

const FORMAT = 1;
const cache = new Map();

/**
 * @returns {Promise<{date:string, sets:Record<string,[string,string][]>}|null>}
 */
export async function loadDailySet(day = todayKey(), base = import.meta.env.BASE_URL) {
  if (cache.has(day)) return cache.get(day);

  let data = null;
  try {
    const res = await fetch(`${base}data/daily/${day}.json`);
    if (res.ok) {
      const json = await res.json();
      // Guard the shape: a stale/rewritten file shouldn't crash the game.
      if (json && json.v === FORMAT && json.sets && typeof json.sets === "object") {
        data = json;
      }
    }
  } catch {
    /* offline, 404, malformed — fall back to runtime generation */
  }

  cache.set(day, data);
  return data;
}

/** The [real, fake] pair list for one difficulty, or null. */
export function pairsFor(data, difficulty) {
  const set = data?.sets?.[difficulty];
  return Array.isArray(set) && set.length ? set : null;
}
