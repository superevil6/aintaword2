// Per-day, per-difficulty result storage for Letter Shooter.
//
// Thin adapter over core/history.js (the shared per-day store — see that file
// for the schema). All-time best stays a separate, game-owned key.
//
// Letter Shooter ACCUMULATES: your score is the points you banked across the
// run, higher is better, measured against the day's perfect-timing par. A result
// records that score, the par, and how many of the five rounds you banked (ties
// on score break to more rounds banked — steadier play).

import { todayKey } from "../../core/daily.js";
import { dayResults, getResult as histGet, putResult, playedDates as histDates } from "../../core/history.js";

const GAME = "lettershooter";
const BEST_KEY = "aintaword2:lettershooter:best";

export { todayKey };

/** Deterministic seed for a day + difficulty — identical for all players. */
export function dailySeedFor(difficulty, day = todayKey()) {
  return `lettershooter:${day}:${difficulty}`;
}

/** All of a day's results, keyed by difficulty id. Defaults to today. */
export function todaysResults(day = todayKey()) {
  return dayResults(GAME, day);
}

/** @returns {{score:number, par:number, rounds:number, lengths:number[], playedAt:string}|null} */
export function getResult(difficulty, day = todayKey()) {
  return histGet(GAME, difficulty, day);
}

/**
 * `lengths` is the word length banked per round (0 = busted), kept so revisiting
 * a finished day can redraw the same receipt instead of restarting the run.
 */
export function saveResult(difficulty, { score, par, rounds, lengths }, day = todayKey()) {
  putResult(GAME, difficulty, { score, par, rounds, lengths, playedAt: new Date().toISOString() }, day);
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

/** @returns {boolean} was it a personal record (higher score, or more rounds on a tie) */
export function recordBest(difficulty, { score, par, rounds }) {
  const prev = bestResult(difficulty);
  const better =
    !prev ||
    score > prev.score ||
    (score === prev.score && rounds > (prev.rounds || 0));
  if (!better) return false;
  try {
    localStorage.setItem(`${BEST_KEY}:${difficulty}`, JSON.stringify({ score, par, rounds }));
  } catch {
    /* ignore */
  }
  return true;
}
