// Per-day, per-difficulty result storage for Mirrorword.
//
// Mirrors games/rootword/results.js. Mirrorword is a "score as high as you can,
// up to par" game, so more points wins. The stored result is the best-scoring
// valid square the player banked that day, keyed to a single day and
// self-pruning — if the stored date isn't today, the blob is treated as empty,
// so localStorage never accumulates history.

import { todayKey } from "../../core/daily.js";

const KEY = "aintaword2:mirrorword:daily";
const BEST_KEY = "aintaword2:mirrorword:best";

export { todayKey };

/** Deterministic seed for a given day + difficulty — identical for all players. */
export function dailySeedFor(difficulty, day = todayKey()) {
  return `mirrorword:${day}:${difficulty}`;
}

function readToday() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.date !== todayKey()) return null;
    return data;
  } catch {
    return null;
  }
}

export function todaysResults() {
  return readToday()?.results || {};
}

/** @returns {{score:number, par:number, playedAt:string}|null} */
export function getResult(difficulty) {
  return todaysResults()[difficulty] || null;
}

export function saveResult(difficulty, { score, par }) {
  try {
    const data = readToday() || { date: todayKey(), results: {} };
    data.date = todayKey();
    data.results[difficulty] = { score, par, playedAt: new Date().toISOString() };
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* private mode / quota — the run just won't persist */
  }
}

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
