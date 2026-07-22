// Loads a precomputed daily course.
//
// Each day is an immutable file holding, for every difficulty, the HOLES plates
// of that day's course — each with its par, an example par word (for the hint),
// and the length of the shortest sub-par "birdie" word if one exists — plus the
// course par (see scripts/build-vanityplate-daily.mjs). Loading it means the
// plates a player sees are the ones that were committed, so a later tuning
// change to the plate filter cannot rewrite a day someone has already played,
// and par is computed once at build time rather than shipping the whole SCOWL
// pool to the client.
//
// Loading is best-effort. If the day's file is missing — past the generated
// range, or a deploy hiccup — courseFor() returns null and the game shows a
// "no course today" note rather than crashing. There is no runtime fallback:
// par needs the curated familiar pool, which is deliberately not in the bundle.

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
    const res = await fetch(`${base}data/vanityplate/${day}.json`);
    if (res.ok) {
      const json = await res.json();
      if (json && json.v === FORMAT && json.sets && typeof json.sets === "object") {
        data = json;
      }
    }
  } catch {
    /* offline, 404, malformed — treat as no course for today */
  }

  cache.set(day, data);
  return data;
}

/**
 * One difficulty's course: `{ name, par, holes: [{plate, par, ex, birdie}] }`,
 * or null when the day or difficulty is absent.
 */
export function courseFor(data, difficulty) {
  const set = data?.sets?.[difficulty];
  if (!set || !Array.isArray(set.holes) || !set.holes.length) return null;
  return set;
}
