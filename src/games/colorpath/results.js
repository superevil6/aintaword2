// Per-day, per-difficulty result storage for Color Path.
//
// Each difficulty is a once-a-day board: solving it records the result, and
// re-selecting that tier shows the result rather than regenerating the same
// puzzle. Everything is keyed to a single day and self-prunes — if the stored
// date isn't today, the whole blob is treated as empty, so localStorage never
// accumulates history.
//
// Mirrors games/aintaword/results.js. The difference is what "better" means:
// Color Path is a golf score, so fewer moves wins and ties break on time.

import { todayKey } from "../../core/daily.js";

const KEY = "aintaword2:colorpath:daily";
const BEST_KEY = "aintaword2:colorpath:best";

export { todayKey };

/** Deterministic seed for a given day + difficulty — identical for all players. */
export function dailySeedFor(difficulty, day = todayKey()) {
  return `colorpath:${day}:${difficulty}`;
}

function readToday() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Stale day → treat as no results, and let the next write overwrite it.
    if (!data || data.date !== todayKey()) return null;
    return data;
  } catch {
    return null;
  }
}

/** All of today's results, keyed by difficulty id. */
export function todaysResults() {
  return readToday()?.results || {};
}

/** @returns {{moves:number, timeMs:number, playedAt:string}|null} */
export function getResult(difficulty) {
  return todaysResults()[difficulty] || null;
}

export function hasPlayed(difficulty) {
  return getResult(difficulty) != null;
}

export function saveResult(difficulty, { moves, timeMs }) {
  try {
    const data = readToday() || { date: todayKey(), results: {} };
    data.date = todayKey();
    data.results[difficulty] = {
      moves,
      timeMs,
      playedAt: new Date().toISOString(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* private mode / quota — the run just won't persist */
  }
}

// --- all-time best, per difficulty ---------------------------------------

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
 * count still counts as a record if it was solved faster.
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
