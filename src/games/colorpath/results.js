// Per-day, per-difficulty result storage for Color Path.
//
// Thin adapter over core/history.js, which now persists EVERY day's results (not
// just today) in one uniform store — see that file for the schema and the reason
// it is shared. Archive replays of past days are recorded under their own date,
// so completing an old board earns a completion dot and can never overwrite
// today's result. All-time best (below) stays a separate, game-owned key.
//
// Color Path is a golf score, so "better" means fewer moves, ties breaking on time.

import { todayKey } from "../../core/daily.js";
import { dayResults, getResult as histGet, putResult, playedDates as histDates } from "../../core/history.js";

const GAME = "colorpath";
const BEST_KEY = "aintaword2:colorpath:best";

export { todayKey };

/** Deterministic seed for a given day + difficulty — identical for all players. */
export function dailySeedFor(difficulty, day = todayKey()) {
  return `colorpath:${day}:${difficulty}`;
}

/** All of a day's results, keyed by difficulty id. Defaults to today. */
export function todaysResults(day = todayKey()) {
  return dayResults(GAME, day);
}

/** @returns {{moves:number, timeMs:number, playedAt:string}|null} */
export function getResult(difficulty, day = todayKey()) {
  return histGet(GAME, difficulty, day);
}

export function hasPlayed(difficulty, day = todayKey()) {
  return getResult(difficulty, day) != null;
}

export function saveResult(difficulty, { moves, timeMs }, day = todayKey()) {
  putResult(GAME, difficulty, { moves, timeMs, playedAt: new Date().toISOString() }, day);
}

/** Every date this game has been completed on — for the archive's played marks. */
export function playedDates() {
  return histDates(GAME);
}

// --- all-time best, per difficulty (separate from per-day history) -----------

/** @returns {{moves:number, timeMs:number}|null} */
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

/**
 * Records a new best if it beats the old one. Fewer moves wins; an equal move
 * count still counts as a record if it was solved faster. Any completion can set
 * a record — an archive replay of an old board counts just like today's.
 *
 * @returns {boolean} was it a record
 */
export function recordBest(difficulty, { moves, timeMs }) {
  const prev = bestResult(difficulty);
  const better =
    !prev || moves < prev.moves || (moves === prev.moves && timeMs < prev.timeMs);
  if (!better) return false;
  try {
    localStorage.setItem(`${BEST_KEY}:${difficulty}`, JSON.stringify({ moves, timeMs }));
  } catch {
    /* ignore */
  }
  return true;
}
