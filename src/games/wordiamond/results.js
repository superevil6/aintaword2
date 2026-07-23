// Per-day, per-mode result storage for Wordiamond.
//
// Thin adapter over core/history.js, which now persists EVERY day's results (not
// just today) in one uniform store — see that file for the schema and the reason
// it is shared. Archive replays of past days are recorded under their own date,
// so completing an old board earns a completion dot and can never overwrite
// today's result.
//
// Wordiamond keys each day's results by MODE (the store's middle arg is just an
// opaque key). What gets kept per mode is the RING the player landed on: with
// several valid solutions per puzzle, which one you found is the interesting
// thing to come back to, and it is what the result screen is built around.
//
// Deliberately no all-time best. The other games track one, but a "best moves"
// would put a number back in front of the player to fall short of, which is
// exactly what we took out of the win screen.

import { todayKey } from "../../core/daily.js";
import { dayResults, getResult as histGet, putResult, playedDates as histDates } from "../../core/history.js";

const GAME = "wordiamond";

export { todayKey };

/** All of a day's results, keyed by mode id. Defaults to today. */
export function todaysResults(day = todayKey()) {
  return dayResults(GAME, day);
}

/** @returns {{moves:number, ring:string[], rings:number, playedAt:string}|null} */
export function getResult(mode, day = todayKey()) {
  return histGet(GAME, mode, day);
}

export function hasPlayed(mode, day = todayKey()) {
  return getResult(mode, day) != null;
}

export function saveResult(mode, { moves, ring, rings }, day = todayKey()) {
  putResult(GAME, mode, {
    moves,
    ring: [...ring],
    rings,
    playedAt: new Date().toISOString(),
  }, day);
}

/** Every date this game has been completed on — for the archive's played marks. */
export function playedDates() {
  return histDates(GAME);
}
