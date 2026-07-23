// Per-day, per-difficulty result storage for Ain't a Word.
//
// Thin adapter over core/history.js, which now persists EVERY day's results (not
// just today) in one uniform store — see that file for the schema and the reason
// it is shared. Archive replays of past days are recorded under their own date,
// so completing an old board earns a completion dot and can never overwrite
// today's result. All-time best (below) stays a separate, game-owned key.

import { todayKey } from "../../core/daily.js";
import { dayResults, getResult as histGet, putResult, playedDates as histDates } from "../../core/history.js";

const GAME = "aintaword";
const BEST_KEY = "aintaword2:aintaword:best";

export { todayKey };

/** Deterministic seed for a given day + difficulty — identical for all players. */
export function dailySeedFor(difficulty, day = todayKey()) {
  return `aintaword:${day}:${difficulty}`;
}

/** All of a day's results, keyed by difficulty id. Defaults to today. */
export function todaysResults(day = todayKey()) {
  return dayResults(GAME, day);
}

/** @returns {{score:number, history:Array, playedAt:string}|null} */
export function getResult(difficulty, day = todayKey()) {
  return histGet(GAME, difficulty, day);
}

export function hasPlayed(difficulty, day = todayKey()) {
  return getResult(difficulty, day) != null;
}

export function saveResult(difficulty, { score, history }, day = todayKey()) {
  putResult(
    GAME,
    difficulty,
    {
      score,
      // Only what the review list and share text need.
      history: history.map((r) => ({ real: r.real, fake: r.fake, correct: r.correct })),
      playedAt: new Date().toISOString(),
    },
    day,
  );
}

/** Every date this game has been completed on — for the archive's played marks. */
export function playedDates() {
  return histDates(GAME);
}

// --- all-time best, per difficulty (separate from per-day history) -----------

export function bestScore(difficulty) {
  try {
    return parseInt(localStorage.getItem(`${BEST_KEY}:${difficulty}`) || "0", 10) || 0;
  } catch {
    return 0;
  }
}

/** Records a new best if it beats the old one. @returns {boolean} was it a record */
export function recordBest(difficulty, score) {
  const prev = bestScore(difficulty);
  if (score <= prev) return false;
  try {
    localStorage.setItem(`${BEST_KEY}:${difficulty}`, String(score));
  } catch {
    /* ignore */
  }
  return true;
}
