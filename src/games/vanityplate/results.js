// Per-day, per-difficulty result storage for Vanity Plate.
//
// Mirrors games/numburst/results.js, but Vanity Plate is GOLF: lower is better.
// A result is the round's total strokes against the course par; "better" means
// fewer strokes, ties broken by more birdies.

import { todayKey } from "../../core/daily.js";

const KEY = "aintaword2:vanityplate:daily";
const BEST_KEY = "aintaword2:vanityplate:best";

export { todayKey };

/** Deterministic seed for a given day + difficulty — identical for all players. */
export function dailySeedFor(difficulty, day = todayKey()) {
  return `vanityplate:${day}:${difficulty}`;
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
// unplayed and never writes, so replaying an old course can't overwrite today's
// scorecard or pollute the all-time best. Persisting past days is the later
// "completion history" step; until then archive plays are just-for-fun.
function isToday(day) {
  return day === todayKey();
}

export function todaysResults(day = todayKey()) {
  if (!isToday(day)) return {};
  return readToday()?.results || {};
}

/** @returns {{strokes:number, par:number, birdies:number, playedAt:string}|null} */
export function getResult(difficulty, day = todayKey()) {
  return todaysResults(day)[difficulty] || null;
}

export function saveResult(difficulty, { strokes, par, birdies }, day = todayKey()) {
  if (!isToday(day)) return; // ephemeral archive replay — don't persist
  try {
    const data = readToday() || { date: todayKey(), results: {} };
    data.date = todayKey();
    data.results[difficulty] = {
      strokes,
      par,
      birdies,
      playedAt: new Date().toISOString(),
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
    return typeof best?.strokes === "number" ? best : null;
  } catch {
    return null;
  }
}

/** @returns {boolean} was it a personal record (fewer strokes, or more birdies on a tie) */
export function recordBest(difficulty, { strokes, par, birdies }, day = todayKey()) {
  if (!isToday(day)) return false; // archive replays don't set all-time records
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
