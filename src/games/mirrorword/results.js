// Per-day, per-difficulty result storage for Mirrorword.
//
// Thin adapter over core/history.js, which now persists EVERY day's results (not
// just today) in one uniform store — see that file for the schema and the reason
// it is shared. Archive replays of past days are recorded under their own date,
// so completing an old board earns a completion dot and can never overwrite
// today's result. All-time best (below) stays a separate, game-owned key.

import { todayKey } from "../../core/daily.js";
import { dayResults, getResult as histGet, putResult, playedDates as histDates } from "../../core/history.js";

const GAME = "mirrorword";
const BEST_KEY = "aintaword2:mirrorword:best";

export { todayKey };

/** Deterministic seed for a given day + difficulty — identical for all players. */
export function dailySeedFor(difficulty, day = todayKey()) {
  return `mirrorword:${day}:${difficulty}`;
}

/** All of a day's results, keyed by difficulty id. Defaults to today. */
export function todaysResults(day = todayKey()) {
  return dayResults(GAME, day);
}

/** @returns {{score:number, par:number, playedAt:string}|null} */
export function getResult(difficulty, day = todayKey()) {
  return histGet(GAME, difficulty, day);
}

export function saveResult(difficulty, { score, par }, day = todayKey()) {
  putResult(GAME, difficulty, { score, par, playedAt: new Date().toISOString() }, day);
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
    return typeof best?.score === "number" ? best : null;
  } catch {
    return null;
  }
}

/** @returns {boolean} was it a record (best raw score at this tier) */
export function recordBest(difficulty, { score }) {
  const prev = bestResult(difficulty);
  if (prev && score <= prev.score) return false;
  try {
    localStorage.setItem(`${BEST_KEY}:${difficulty}`, JSON.stringify({ score }));
  } catch {
    /* ignore */
  }
  return true;
}
