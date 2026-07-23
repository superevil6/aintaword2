// Per-day, per-difficulty result storage for Wordiamond.
//
// Each difficulty is a once-a-day board: solving it records the result, and
// re-selecting that mode shows the result rather than dealing the same board
// again. Everything is keyed to a single day and self-prunes — if the stored
// date isn't today, the whole blob is treated as empty, so localStorage never
// accumulates history.
//
// Mirrors games/colorpath/results.js. The difference is what gets kept: the
// RING the player landed on, because with several valid solutions per puzzle
// which one you found is the interesting thing to come back to — and it is
// what the result screen is built around.
//
// Deliberately no all-time best. The other two games track one, but a "best
// moves" would put a number back in front of the player to fall short of,
// which is exactly what we took out of the win screen.

import { todayKey } from "../../core/daily.js";

const KEY = "aintaword2:wordiamond:daily";

export { todayKey };

function readToday() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Stale day → treat as no results, and let the next write overwrite it.
    if (!data || data.date !== todayKey()) return null;
    return data;
  } catch {
    return null;
  }
}

// Every reader/writer takes an optional `day`. Only today's puzzle is persisted;
// an archive replay (a past day, a supporter perk) is EPHEMERAL — it reads as
// unplayed and never writes, so replaying an old board can't overwrite today's
// result. Persisting past days would be a later "completion history" step;
// until then archive plays are just-for-fun.
function isToday(day) {
  return day === todayKey();
}

/** All of today's results, keyed by mode id. */
export function todaysResults(day = todayKey()) {
  if (!isToday(day)) return {};
  return readToday()?.results || {};
}

/** @returns {{moves:number, ring:string[], rings:number, playedAt:string}|null} */
export function getResult(mode, day = todayKey()) {
  return todaysResults(day)[mode] || null;
}

export function hasPlayed(mode, day = todayKey()) {
  return getResult(mode, day) != null;
}

export function saveResult(mode, { moves, ring, rings }, day = todayKey()) {
  if (!isToday(day)) return; // ephemeral archive replay — don't persist
  try {
    const data = readToday() || { date: todayKey(), results: {} };
    data.date = todayKey();
    data.results[mode] = {
      moves,
      ring: [...ring],
      rings,
      playedAt: new Date().toISOString(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* private mode / quota — the run just won't persist */
  }
}

/** Wipe today's results. Only for tests and a future "reset" affordance. */
export function clearResults() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
