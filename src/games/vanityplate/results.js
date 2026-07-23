// Per-day, per-difficulty result storage for Vanity Plate.
//
// Thin adapter over core/history.js, which now persists EVERY day's results (not
// just today) in one uniform store — see that file for the schema and the reason
// it is shared. Archive replays of past days are recorded under their own date,
// so completing an old course earns a completion dot and can never overwrite
// today's scorecard. Vanity Plate is GOLF: lower is better — a result is the
// round's total strokes against course par, ties broken by more birdies. All-time
// best (below) stays a separate, game-owned key.

import { todayKey } from "../../core/daily.js";
import { dayResults, getResult as histGet, putResult, playedDates as histDates } from "../../core/history.js";

const GAME = "vanityplate";
const BEST_KEY = "aintaword2:vanityplate:best";

export { todayKey };

/** Deterministic seed for a given day + difficulty — identical for all players. */
export function dailySeedFor(difficulty, day = todayKey()) {
  return `vanityplate:${day}:${difficulty}`;
}

/** All of a day's results, keyed by difficulty id. Defaults to today. */
export function todaysResults(day = todayKey()) {
  return dayResults(GAME, day);
}

/** @returns {{strokes:number, par:number, birdies:number, playedAt:string}|null} */
export function getResult(difficulty, day = todayKey()) {
  return histGet(GAME, difficulty, day);
}

export function saveResult(difficulty, { strokes, par, birdies }, day = todayKey()) {
  putResult(
    GAME,
    difficulty,
    { strokes, par, birdies, playedAt: new Date().toISOString() },
    day,
  );
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
    return typeof best?.strokes === "number" ? best : null;
  } catch {
    return null;
  }
}

/** @returns {boolean} was it a personal record (fewer strokes, or more birdies on a tie) */
export function recordBest(difficulty, { strokes, par, birdies }) {
  const prev = bestResult(difficulty);
  const better =
    !prev ||
    strokes < prev.strokes ||
    (strokes === prev.strokes && birdies > (prev.birdies || 0));
  if (!better) return false;
  try {
    localStorage.setItem(
      `${BEST_KEY}:${difficulty}`,
      JSON.stringify({ strokes, par, birdies }),
    );
  } catch {
    /* ignore */
  }
  return true;
}
