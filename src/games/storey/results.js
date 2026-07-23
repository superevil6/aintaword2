// Per-day, per-difficulty result storage for Storey.
//
// Thin adapter over core/history.js, which now persists EVERY day's results (not
// just today) in one uniform store — see that file for the schema and the reason
// it is shared. Archive replays of past days are recorded under their own date,
// so completing an old build earns a completion dot and can never overwrite
// today's result. All-time best (below) stays a separate, game-owned key.
//
// Storey ACCUMULATES: your score is the net worth of the tower you built, and
// higher is better (unlike Vanity Plate's golf). A result records that score
// against the day's par, plus how many storeys you managed. Ties on score break
// to the taller tower.

import { todayKey } from "../../core/daily.js";
import { dayResults, getResult as histGet, putResult, playedDates as histDates } from "../../core/history.js";

const GAME = "storey";
const BEST_KEY = "aintaword2:storey:best";

export { todayKey };

/** Deterministic seed for a given day + difficulty — identical for all players. */
export function dailySeedFor(difficulty, day = todayKey()) {
  return `storey:${day}:${difficulty}`;
}

/** All of a day's results, keyed by difficulty id. Defaults to today. */
export function todaysResults(day = todayKey()) {
  return dayResults(GAME, day);
}

/** @returns {{score:number, par:number, stories:number, playedAt:string}|null} */
export function getResult(difficulty, day = todayKey()) {
  return histGet(GAME, difficulty, day);
}

export function saveResult(difficulty, { score, par, stories }, day = todayKey()) {
  putResult(GAME, difficulty, { score, par, stories, playedAt: new Date().toISOString() }, day);
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

/** @returns {boolean} was it a personal record (higher score, or taller on a tie) */
export function recordBest(difficulty, { score, par, stories }) {
  const prev = bestResult(difficulty);
  const better =
    !prev ||
    score > prev.score ||
    (score === prev.score && stories > (prev.stories || 0));
  if (!better) return false;
  try {
    localStorage.setItem(
      `${BEST_KEY}:${difficulty}`,
      JSON.stringify({ score, par, stories }),
    );
  } catch {
    /* ignore */
  }
  return true;
}
