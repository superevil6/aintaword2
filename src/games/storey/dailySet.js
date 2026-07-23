// Loads a precomputed daily set of Storey hands.
//
// Each day is an immutable file holding, for every difficulty, that day's HAND
// of consonant tiles, its GRAVITY, the day's PAR and how many storeys the
// optimal tower is, and the optimal FLOORS themselves (left/right pillars, an
// example word, and its width) — see scripts/build-storey-daily.mjs.
//
// Par is measured over the curated familiar pool at build time and frozen here,
// so a later tuning change cannot rewrite a day already played, and the ~11k
// familiar pool never has to ship to the client — the runtime only needs ENABLE
// (already loaded) to validate the arbitrary words a player types as floors.
//
// Loading is best-effort: a missing day (past the generated range, or a deploy
// hiccup) makes setFor() return null and the game shows a "no build today" note
// rather than crashing.

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
    const res = await fetch(`${base}data/storey/${day}.json`);
    if (res.ok) {
      const json = await res.json();
      if (json && json.v === FORMAT && json.sets && typeof json.sets === "object") {
        data = json;
      }
    }
  } catch {
    /* offline, 404, malformed — treat as no build for today */
  }

  cache.set(day, data);
  return data;
}

/**
 * One difficulty's build: `{ site, hand, gravity, par, stories, floors }`,
 * or null when the day or difficulty is absent.
 */
export function setFor(data, difficulty) {
  const set = data?.sets?.[difficulty];
  if (!set || !Array.isArray(set.hand) || !set.hand.length) return null;
  return set;
}
