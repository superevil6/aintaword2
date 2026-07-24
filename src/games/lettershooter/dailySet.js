// Loads a precomputed daily set for Letter Shooter.
//
// Each day is an immutable file holding, for every difficulty, that tier's five
// AMMO letters, the day's PAR (the sum of each round's perfect-timing best word),
// and those BEST words for the post-run reveal — see scripts/build-lettershooter-daily.mjs.
//
// The scrolling ROWS themselves are not stored: they regenerate from the day's
// seed (dailySeedFor) on the client, endlessly and identically for everyone, so
// the file only needs to freeze the par the board admits. Par is measured over
// the full ENABLE list at build time and frozen here so a later tuning change
// can't rewrite a day already played.
//
// Loading is best-effort: a missing day (past the generated range, or a deploy
// hiccup) makes setFor() return null and the game shows a "no build today" note.

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
    const res = await fetch(`${base}data/lettershooter/${day}.json`);
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
 * One difficulty's build: `{ ammo, par, best }`, or null when the day or
 * difficulty is absent.
 */
export function setFor(data, difficulty) {
  const set = data?.sets?.[difficulty];
  if (!set || !Array.isArray(set.ammo) || !set.ammo.length) return null;
  return set;
}
