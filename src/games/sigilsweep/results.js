// Per-day, per-difficulty result storage for sigilsweep.
//
// Thin adapter over core/history.js (the shared per-day store), mirroring
// colordrop/results.js. sigilsweep is a SCORE, not a golf score: higher is
// better, and the score already folds in how fast you committed.

import { todayKey } from "../../core/daily.js";
import { dayResults, getResult as histGet, putResult, playedDates as histDates } from "../../core/history.js";

const GAME = "sigilsweep";
const BEST_KEY = "aintaword2:sigilsweep:best";

export { todayKey };

/** Deterministic seed for a given day + difficulty — identical for all players. */
export function dailySeedFor(difficulty, day = todayKey()) {
  return `sigilsweep:${day}:${difficulty}`;
}

/** All of a day's results, keyed by difficulty id. Defaults to today. */
export function todaysResults(day = todayKey()) {
  return dayResults(GAME, day);
}

/** @returns {{score:number, hits:number, rounds:number, playedAt:string}|null} */
export function getResult(difficulty, day = todayKey()) {
  return histGet(GAME, difficulty, day);
}

export function hasPlayed(difficulty, day = todayKey()) {
  return getResult(difficulty, day) != null;
}

export function saveResult(difficulty, { score, hits, rounds }, day = todayKey()) {
  putResult(GAME, difficulty, { score, hits, rounds, playedAt: new Date().toISOString() }, day);
}

/** Every date this game has been completed on — for the archive's played marks. */
export function playedDates() {
  return histDates(GAME);
}

// --- all-time best, per difficulty (separate from per-day history) -----------

/** @returns {{score:number, hits:number, rounds:number}|null} */
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

/**
 * Records a new best if it beats the old one. Higher score wins. Any completion
 * can set a record — an archive replay counts like today's.
 *
 * @returns {boolean} was it a record
 */
export function recordBest(difficulty, { score, hits, rounds }) {
  const prev = bestResult(difficulty);
  if (prev && score <= prev.score) return false;
  try {
    localStorage.setItem(`${BEST_KEY}:${difficulty}`, JSON.stringify({ score, hits, rounds }));
  } catch {
    /* ignore */
  }
  return true;
}
