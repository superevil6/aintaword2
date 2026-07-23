// Per-day, per-difficulty result storage for Photon Finish.
//
// Mirrors games/numburst/results.js. "Better" runs the other way from a score
// game: solving at all is the result, and among solves fewer adjustments wins.

import { todayKey } from "../../core/daily.js";

const KEY = "aintaword2:photonfinish:daily";
const BEST_KEY = "aintaword2:photonfinish:best";

export { todayKey };

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

// Every reader/writer takes an optional `day`. Only today's puzzle is persisted;
// an archive replay (a past day, a supporter perk) is EPHEMERAL — it reads as
// unplayed and never writes, so replaying an old board can't overwrite today's
// result or pollute the all-time best. Persisting past days is the later
// "completion history" step; until then archive plays are just-for-fun.
function isToday(day) {
  return day === todayKey();
}

export function todaysResults(day = todayKey()) {
  if (!isToday(day)) return {};
  return readToday()?.results || {};
}

/** @returns {{solved:boolean, moves:number, playedAt:string}|null} */
export function getResult(difficulty, day = todayKey()) {
  return todaysResults(day)[difficulty] || null;
}

export function saveResult(difficulty, { solved, moves }, day = todayKey()) {
  if (!isToday(day)) return; // ephemeral archive replay — don't persist
  try {
    const data = readToday() || { date: todayKey(), results: {} };
    data.date = todayKey();
    data.results[difficulty] = { solved, moves, playedAt: new Date().toISOString() };
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
    return typeof best?.moves === "number" ? best : null;
  } catch {
    return null;
  }
}

/** @returns {boolean} was it a record */
export function recordBest(difficulty, { solved, moves }, day = todayKey()) {
  if (!isToday(day)) return false; // archive replays don't set all-time records
  if (!solved) return false;
  const prev = bestResult(difficulty);
  if (prev && prev.moves <= moves) return false;
  try {
    localStorage.setItem(`${BEST_KEY}:${difficulty}`, JSON.stringify({ solved, moves }));
  } catch {
    /* ignore */
  }
  return true;
}
