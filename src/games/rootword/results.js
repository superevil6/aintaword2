// Per-day, per-difficulty result storage for Rootword.
//
// Mirrors games/numburst/results.js. Rootword is a "get as close to par as you
// can" score, so more points wins and ties break on FEWER branches spent (a
// tidier tree that reached the same score is the better play).

import { todayKey } from "../../core/daily.js";

const KEY = "aintaword2:rootword:daily";
const BEST_KEY = "aintaword2:rootword:best";

export { todayKey };

/** Deterministic seed for a given day + difficulty — identical for all players. */
export function dailySeedFor(difficulty, day = todayKey()) {
  return `rootword:${day}:${difficulty}`;
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

/** @returns {{score:number, par:number, branches:number, words:string[], playedAt:string}|null} */
export function getResult(difficulty, day = todayKey()) {
  return todaysResults(day)[difficulty] || null;
}

export function saveResult(difficulty, { score, par, branches, words }, day = todayKey()) {
  if (!isToday(day)) return; // ephemeral archive replay — don't persist
  try {
    const data = readToday() || { date: todayKey(), results: {} };
    data.date = todayKey();
    data.results[difficulty] = {
      score, par, branches, words, playedAt: new Date().toISOString(),
    };
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

/** @returns {boolean} was it a record */
export function recordBest(difficulty, { score, branches }, day = todayKey()) {
  if (!isToday(day)) return false; // archive replays don't set all-time records
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
