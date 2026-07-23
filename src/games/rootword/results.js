// Per-day, per-difficulty result storage for Rootword.
//
// Thin adapter over core/history.js, which now persists EVERY day's results (not
// just today) in one uniform store — see that file for the schema and the reason
// it is shared. Archive replays of past days are recorded under their own date,
// so completing an old board earns a completion dot and can never overwrite
// today's result. All-time best (below) stays a separate, game-owned key.
//
// Rootword is a "get as close to par as you can" score, so more points wins and
// ties break on FEWER branches spent (a tidier tree that reached the same score
// is the better play).

import { todayKey } from "../../core/daily.js";
import { dayResults, getResult as histGet, putResult, playedDates as histDates } from "../../core/history.js";

const GAME = "rootword";
const BEST_KEY = "aintaword2:rootword:best";

export { todayKey };

/** Deterministic seed for a given day + difficulty — identical for all players. */
export function dailySeedFor(difficulty, day = todayKey()) {
  return `rootword:${day}:${difficulty}`;
}

/** All of a day's results, keyed by difficulty id. Defaults to today. */
export function todaysResults(day = todayKey()) {
  return dayResults(GAME, day);
}

/** @returns {{score:number, par:number, branches:number, words:string[], playedAt:string}|null} */
export function getResult(difficulty, day = todayKey()) {
  return histGet(GAME, difficulty, day);
}

export function saveResult(difficulty, { score, par, branches, words }, day = todayKey()) {
  putResult(GAME, difficulty, { score, par, branches, words, playedAt: new Date().toISOString() }, day);
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

/** @returns {boolean} was it a record */
export function recordBest(difficulty, { score, branches }) {
  const prev = bestResult(difficulty);
  const better =
    !prev || score > prev.score ||
    (score === prev.score && branches < (prev.branches ?? Infinity));
  if (!better) return false;
  try {
    localStorage.setItem(`${BEST_KEY}:${difficulty}`, JSON.stringify({ score, branches }));
  } catch {
    /* ignore */
  }
  return true;
}
