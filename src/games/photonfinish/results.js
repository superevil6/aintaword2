// Per-day, per-difficulty result storage for Photon Finish.
//
// Thin adapter over core/history.js, which now persists EVERY day's results (not
// just today) in one uniform store — see that file for the schema and the reason
// it is shared. Archive replays of past days are recorded under their own date,
// so completing an old board earns a completion dot and can never overwrite
// today's result. All-time best (below) stays a separate, game-owned key.
//
// "Better" runs the other way from a score game: solving at all is the result,
// and among solves fewer adjustments wins.

import { todayKey } from "../../core/daily.js";
import { dayResults, getResult as histGet, putResult, playedDates as histDates } from "../../core/history.js";

const GAME = "photonfinish";
const BEST_KEY = "aintaword2:photonfinish:best";

export { todayKey };

/** All of a day's results, keyed by difficulty id. Defaults to today. */
export function todaysResults(day = todayKey()) {
  return dayResults(GAME, day);
}

/** @returns {{solved:boolean, moves:number, playedAt:string}|null} */
export function getResult(difficulty, day = todayKey()) {
  return histGet(GAME, difficulty, day);
}

export function saveResult(difficulty, { solved, moves }, day = todayKey()) {
  putResult(GAME, difficulty, { solved, moves, playedAt: new Date().toISOString() }, day);
}

/** Every date this game has been completed on — for the archive's played marks. */
export function playedDates() {
  return histDates(GAME);
}

// --- all-time best, per difficulty (separate from per-day history) -----------

export function bestResult(difficulty) {
  try {
    const raw = localStorage.getItem(`${BEST_KEY}:${difficulty}`);
    if (!raw) return null;
    const best = JSON.parse(raw);
    return typeof best?.moves === "number" ? best : null;
  } catch {
    return null;
  }
}

/** @returns {boolean} was it a record */
export function recordBest(difficulty, { solved, moves }) {
  if (!solved) return false;
  const prev = bestResult(difficulty);
  if (prev && prev.moves <= moves) return false;
  try {
    localStorage.setItem(`${BEST_KEY}:${difficulty}`, JSON.stringify({ solved, moves }));
  } catch {
    /* ignore */
  }
  return true;
}
